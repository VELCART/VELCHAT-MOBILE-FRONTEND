/**
 * A root / emulator SIGNAL — never a gate (VC-019, §A1).
 *
 * §A1 asks for a "root/jailbreak soft-signal", and the word soft is the whole design. Blocking a
 * rooted device would be security theatre with a real cost: client-side root detection is
 * defeated by the same tooling that does the rooting, so it stops nobody who matters, while it
 * does lock out the owner's own handset and every emulator this app is developed and QA'd on.
 * What the signal is genuinely worth is risk CONTEXT — an enrollment from a device that
 * self-reports as unofficial deserves a different server-side risk score than one that does not,
 * and that is a decision for the backend, not for the client.
 *
 * So there is no `blocked` field here and no code path that refuses anything.
 *
 * §M19 constrains the output just as hard. The raw inputs — `Build.FINGERPRINT`, `Build.TAGS` —
 * name the vendor, the model and the exact build number; together they identify a handset. They
 * are read, matched, and thrown away. Only the fixed reason codes leave this module, and only
 * those are safe to log or send.
 *
 * A stronger check (an `su` binary on PATH, Magisk's package or its unix sockets) needs native
 * code, and a native module needs registering in `MainApplication`. When that lands, it becomes
 * another field on `DeviceIntegritySignals` and the pure assessment below absorbs it unchanged.
 */
import DeviceInfo from 'react-native-device-info';

/** The raw platform facts, as read from the device. Never logged, never transmitted. */
export interface DeviceIntegritySignals {
  /** The platform's own emulator heuristic. */
  readonly emulator: boolean;
  /** `Build.TAGS` — "release-keys" on a retail image, "test-keys" on an AOSP-signed one. */
  readonly buildTags: string;
  /** `Build.FINGERPRINT` — vendor/product/device:release/id/build:type/tags. */
  readonly fingerprint: string;
}

/** What is safe to act on, log, and hand to the backend as risk context. */
export interface DeviceIntegritySignal {
  readonly emulator: boolean;
  /** Signed with public AOSP keys, or built as userdebug/eng — i.e. not a retail image. */
  readonly unofficialBuild: boolean;
  /** A closed set of lower-case reason codes. Never device-identifying (§M19). */
  readonly reasons: readonly string[];
}

const NOTHING_OBSERVED: DeviceIntegritySignal = {
  emulator: false,
  unofficialBuild: false,
  reasons: [],
};

/**
 * Fingerprint fragments that only appear on emulator images. `isEmulator()` is a heuristic that
 * has been wrong on OEM builds before, so this is the second opinion rather than the only one.
 */
const EMULATOR_MARKERS = [
  'generic',
  'goldfish',
  'ranchu',
  'sdk_gphone',
  'emulator',
  'vbox',
];

/**
 * Turn the raw facts into the signal. Pure, and the part that is tested — the platform reads
 * underneath it cannot be exercised on this machine, but the rule that decides what gets
 * REPORTED (and, just as importantly, what never gets reported) can be.
 */
export function assessDeviceIntegrity(
  signals: DeviceIntegritySignals,
): DeviceIntegritySignal {
  const fingerprint = signals.fingerprint.toLowerCase();
  const tags = signals.buildTags.toLowerCase();
  const reasons: string[] = [];

  if (signals.emulator) reasons.push('emulator');
  const looksEmulated = EMULATOR_MARKERS.some(m => fingerprint.includes(m));
  if (looksEmulated) reasons.push('fingerprint-emulator-image');

  // The classic custom-ROM tell: the image is signed with the public AOSP test keys, which
  // anyone can sign with. Not proof of root, and the naming here must not imply that it is.
  if (tags.includes('test-keys')) reasons.push('build-tags-test-keys');

  // A userdebug or eng build ships with adb root available and SELinux permissive-able.
  const debuggableBuild =
    fingerprint.includes(':userdebug/') || fingerprint.includes(':eng/');
  if (debuggableBuild) reasons.push('fingerprint-debuggable-build');

  return {
    emulator: signals.emulator || looksEmulated,
    unofficialBuild: tags.includes('test-keys') || debuggableBuild,
    reasons,
  };
}

/**
 * Read the signal off the device.
 *
 * Every call is defensive, for the same reason `secureStore.ts` is: this runs on the way to the
 * login screen, and an older build, iOS (where these Android-only getters are absent), or a
 * platform that simply throws must all land in the same place — "nothing observed" — rather
 * than taking the launch down. A security signal that can crash the app is a worse bug than the
 * one it reports on.
 */
export async function readDeviceIntegrity(): Promise<DeviceIntegritySignal> {
  try {
    const [emulator, buildTags, fingerprint] = await Promise.all([
      DeviceInfo.isEmulator(),
      DeviceInfo.getTags(),
      DeviceInfo.getFingerprint(),
    ]);
    return assessDeviceIntegrity({
      emulator: Boolean(emulator),
      buildTags: buildTags ?? '',
      fingerprint: fingerprint ?? '',
    });
  } catch {
    return NOTHING_OBSERVED;
  }
}
