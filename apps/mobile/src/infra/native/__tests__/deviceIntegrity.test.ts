/**
 * The root / emulator SIGNAL (VC-019, §A1).
 *
 * Deliberately a signal and never a verdict. A rooted phone is the owner's phone; an emulator is
 * where this app is developed and QA'd every day. Client-side root detection is also trivially
 * defeatable — anyone who can root a device can hide it — so treating it as a gate buys nothing
 * against a real attacker while locking out legitimate users and our own test devices. What it
 * IS good for is risk context: an enrollment from a device that self-reports as unofficial is
 * worth a different server-side risk score than one that does not.
 *
 * The second rule this file encodes is §M19: the raw inputs (`Build.FINGERPRINT`,
 * `Build.TAGS`) name the device model, the vendor and the build number. They identify a handset
 * and must never reach a log line. Only the fixed reason codes below do.
 */
import {
  assessDeviceIntegrity,
  readDeviceIntegrity,
  type DeviceIntegritySignals,
} from '../deviceIntegrity';

/** A stock retail Android 10 handset — the §M0 reference device, and the boring case. */
const RETAIL: DeviceIntegritySignals = {
  emulator: false,
  buildTags: 'release-keys',
  fingerprint:
    'samsung/a20sxx/a20s:10/QP1A.190711.020/A207FXXU2BTG1:user/release-keys',
};

describe('assessDeviceIntegrity', () => {
  it('says nothing at all about a stock retail device', () => {
    const signal = assessDeviceIntegrity(RETAIL);
    expect(signal).toEqual({
      emulator: false,
      unofficialBuild: false,
      reasons: [],
    });
  });

  it('reports test-keys as an unofficial build without calling it an emulator', () => {
    // A ROM signed with the public AOSP test keys is the classic root/custom-ROM tell. It is not
    // proof of root and it is not an emulator, and the signal must not overstate either.
    const signal = assessDeviceIntegrity({
      ...RETAIL,
      buildTags: 'test-keys',
    });
    expect(signal.unofficialBuild).toBe(true);
    expect(signal.emulator).toBe(false);
    expect(signal.reasons).toContain('build-tags-test-keys');
  });

  it('reports a userdebug/eng build', () => {
    expect(
      assessDeviceIntegrity({
        ...RETAIL,
        fingerprint:
          'google/sdk/sdk:10/QSR1.190920.001/123:userdebug/test-keys',
      }).reasons,
    ).toContain('fingerprint-debuggable-build');
  });

  it('reports the emulator from either the platform probe or the fingerprint', () => {
    expect(assessDeviceIntegrity({ ...RETAIL, emulator: true }).emulator).toBe(
      true,
    );
    // `isEmulator()` is a heuristic too, and it has been wrong on OEM images before. The
    // generic/goldfish fingerprints are the second opinion.
    expect(
      assessDeviceIntegrity({
        ...RETAIL,
        fingerprint:
          'generic/sdk_gphone64_x86_64/emu64x:14/UE1A.230829.036/1:user/release-keys',
      }).emulator,
    ).toBe(true);
  });

  it('reports an emulator that is ALSO an unofficial build as both', () => {
    // The daily driver for QA here. Both facts are true and collapsing them would lose the one
    // that actually matters on a physical handset.
    const signal = assessDeviceIntegrity({
      emulator: true,
      buildTags: 'test-keys',
      fingerprint:
        'Android/sdk_phone_x86/generic_x86:10/QSR1.190920.001/1:userdebug/test-keys',
    });
    expect(signal.emulator).toBe(true);
    expect(signal.unofficialBuild).toBe(true);
  });

  it('never puts a device-identifying string in the reasons (§M19)', () => {
    // The reasons are the part that gets logged and shipped to the backend as risk context. The
    // fingerprint carries the vendor, the model and the exact build — an identifier for the
    // handset. Reason codes are a closed, boring set on purpose.
    const signal = assessDeviceIntegrity({
      emulator: true,
      buildTags: 'test-keys',
      fingerprint:
        'samsung/secret-device-name/xyz:10/BUILD123/42:userdebug/test-keys',
    });
    const joined = signal.reasons.join(' ');
    expect(joined).not.toContain('samsung');
    expect(joined).not.toContain('secret-device-name');
    expect(joined).not.toContain('BUILD123');
    expect(signal.reasons.every(r => /^[a-z0-9-]+$/.test(r))).toBe(true);
  });
});

describe('readDeviceIntegrity', () => {
  it('degrades to "nothing observed" when the platform will not answer', async () => {
    // The Jest stand-in for react-native-device-info only implements the battery calls, which is
    // exactly the shape of an older build or a platform where the module is missing. A security
    // signal that throws on the way to the login screen is worse than no signal at all.
    await expect(readDeviceIntegrity()).resolves.toEqual({
      emulator: false,
      unofficialBuild: false,
      reasons: [],
    });
  });
});
