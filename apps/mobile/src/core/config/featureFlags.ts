/**
 * Client feature flags (§M1) — compile-time toggles for gating in-progress flows.
 *
 * Reverse-OTP (missed-call verify) is parked OFF until the SIP/telephony backend
 * lands; the app ships the 2Factor SMS/voice OTP sheet as the only sign-in path.
 * Flip `reverseOtp` to true to re-expose the "verify another way" entry point.
 */
export const featureFlags = {
  /** Missed-call "Reverse-OTP" verification. OFF ⇒ its screens stay unreachable + hidden. */
  reverseOtp: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;
