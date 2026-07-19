/**
 * Notification-permission wrapper (§M23). Thin typed interface over the OS
 * permission prompt so screens never touch the platform API directly.
 *
 * Android 13+ (API 33): POST_NOTIFICATIONS is a runtime permission → shows the
 * system dialog. Android ≤12: notifications are granted at install → resolves
 * 'granted' with no dialog. iOS: authored but deferred (no native module wired
 * here yet, per the Windows/Android-only build reality) → resolves 'unavailable'.
 */
import { Platform, PermissionsAndroid } from 'react-native';

export type NotificationPermission = 'granted' | 'denied' | 'unavailable';

/**
 * Is the notification permission currently GRANTED? Drives onboarding: the
 * notifications page is shown whenever this is false (never asked OR denied), and
 * skipped only once it's true. Android <33 has no runtime permission → true.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (typeof Platform.Version === 'number' && Platform.Version < 33) {
      return true;
    }
    try {
      return await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    } catch {
      return false;
    }
  }
  return false; // iOS deferred
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (Platform.OS === 'android') {
    // API < 33 has no runtime notification permission — it is granted implicitly.
    if (typeof Platform.Version === 'number' && Platform.Version < 33) {
      return 'granted';
    }
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED
        ? 'granted'
        : 'denied';
    } catch {
      return 'denied';
    }
  }
  // iOS deferred: wire @react-native-community/push-notification-ios (or a native
  // module) behind this same function when the iOS build lands (never report iOS verified).
  return 'unavailable';
}
