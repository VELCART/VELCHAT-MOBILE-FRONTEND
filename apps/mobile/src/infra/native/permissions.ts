/**
 * Runtime permission wrappers (§M23). Thin typed helpers over the OS prompt so
 * features request what they need CONTEXTUALLY (camera before capture, mic before a
 * call, contacts before discovery) — never a wall of prompts on launch. Android 13+
 * uses granular permissions; older APIs grant most at install. iOS prompts are
 * driven by Info.plist usage strings + the calling library (deferred here).
 */
import { Platform, PermissionsAndroid, type Permission } from 'react-native';

async function requestAndroid(permission: Permission): Promise<boolean> {
  if (Platform.OS !== 'android') return false; // iOS handled by the library + Info.plist
  try {
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Camera — photo/video capture, video calls. */
export function requestCameraPermission(): Promise<boolean> {
  return requestAndroid(PermissionsAndroid.PERMISSIONS.CAMERA);
}

/** Microphone — voice messages + voice/video calls. */
export function requestMicrophonePermission(): Promise<boolean> {
  return requestAndroid(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
}

/** Contacts — find which of the user's contacts are on VelChat (salted-hash discovery). */
export function requestContactsPermission(): Promise<boolean> {
  return requestAndroid(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
}

/** Bluetooth (Android 12+) — route call audio to a headset. */
export function requestBluetoothPermission(): Promise<boolean> {
  if (
    Platform.OS === 'android' &&
    typeof Platform.Version === 'number' &&
    Platform.Version < 31
  ) {
    return Promise.resolve(true); // pre-Android 12 grants at install
  }
  return requestAndroid(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
}
