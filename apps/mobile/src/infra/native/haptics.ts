/**
 * Light haptic feedback (§M18 polish). A short tactile tick on step/tab transitions
 * and confirmations makes the UI feel responsive. Android uses the core Vibration
 * pulse (needs the VIBRATE permission); iOS impact haptics
 * (UIImpactFeedbackGenerator) need a native module — wire it behind this same
 * function when the iOS build lands. No-op if the device can't vibrate.
 */
import { Platform, Vibration } from 'react-native';

/** A crisp tick — step change, tab change, primary action. */
export function hapticTick(): void {
  if (Platform.OS === 'android') Vibration.vibrate(12);
}

/** A lighter tick — selection / focus changes. */
export function hapticSelection(): void {
  if (Platform.OS === 'android') Vibration.vibrate(8);
}
