/**
 * When the chat list should jump to the newest message (§F2).
 *
 * The list is INVERTED, so the newest message lives at offset 0 and new content grows the
 * list underneath whatever the user is looking at. Nothing scrolled it back, so a message —
 * including one the user had just typed — landed below the fold and had to be scrolled to by
 * hand. That is the reported "new message chhup jata hai".
 *
 * The rule is the one every chat app uses, and the reason it is a pure function is that the
 * interesting part is the EXCEPTION: someone reading older history must never be yanked to the
 * bottom because a message arrived.
 */
import { shouldScrollToLatest } from '../autoScroll';

describe('shouldScrollToLatest', () => {
  it('always follows a message the user just sent', () => {
    // Even while scrolled far up: sending is an explicit act, and the reply to it is the
    // thing the user is now looking for.
    expect(shouldScrollToLatest({ own: true, offsetY: 4000 })).toBe(true);
    expect(shouldScrollToLatest({ own: true, offsetY: 0 })).toBe(true);
  });

  it('follows an incoming message while the user is already at the bottom', () => {
    expect(shouldScrollToLatest({ own: false, offsetY: 0 })).toBe(true);
  });

  it('tolerates the few pixels of drift that count as "at the bottom"', () => {
    expect(shouldScrollToLatest({ own: false, offsetY: 40 })).toBe(true);
  });

  it('does NOT yank someone who has scrolled up to read history', () => {
    // They get the jump-to-latest affordance instead — pulling the view out from under
    // someone mid-read is worse than the bug being fixed.
    expect(shouldScrollToLatest({ own: false, offsetY: 900 })).toBe(false);
  });
});
