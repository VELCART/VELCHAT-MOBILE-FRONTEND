/**
 * Pure typing-throttle policy (§C4) — no imports, so it stays trivially unit-testable and never
 * spams the socket. `useTyping` owns the timers; this file owns only the decision.
 */

/** At most one `start` per this window while the user keeps typing. */
export const TYPING_START_THROTTLE_MS = 3_000;
/** Send `stop` after this long with no keystroke. */
export const TYPING_IDLE_STOP_MS = 4_000;

/** May we emit another `start` given when the last one went out? `null` = none sent yet. */
export function shouldEmitStart(
  lastStartAt: number | null,
  now: number,
  minGapMs: number = TYPING_START_THROTTLE_MS,
): boolean {
  return lastStartAt === null || now - lastStartAt >= minGapMs;
}
