/**
 * Typing throttle policy — `start` at most once per window, so the composer never spams the socket.
 */
import { shouldEmitStart, TYPING_START_THROTTLE_MS } from '../typingThrottle';

describe('shouldEmitStart', () => {
  it('always emits the first start (no prior send)', () => {
    expect(shouldEmitStart(null, 10_000)).toBe(true);
  });

  it('suppresses a second start inside the throttle window', () => {
    const last = 10_000;
    expect(shouldEmitStart(last, last + TYPING_START_THROTTLE_MS - 1)).toBe(
      false,
    );
  });

  it('re-emits once the window has fully elapsed', () => {
    const last = 10_000;
    expect(shouldEmitStart(last, last + TYPING_START_THROTTLE_MS)).toBe(true);
    expect(shouldEmitStart(last, last + TYPING_START_THROTTLE_MS + 500)).toBe(
      true,
    );
  });

  it('respects a custom gap', () => {
    expect(shouldEmitStart(0, 500, 1000)).toBe(false);
    expect(shouldEmitStart(0, 1000, 1000)).toBe(true);
  });
});
