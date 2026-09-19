/**
 * Where the reader is, which is the only thing the jump-to-latest button depends on (§F2).
 *
 * This used to hold `shouldScrollToLatest`, the rule for whether to FOLLOW a new message. That
 * rule is gone: FlashList follows the end itself via
 * `maintainVisibleContentPosition.autoscrollToBottomThreshold`, and every hand-rolled version of
 * it lost a race with the library's own scroll-anchor correction — the newest bubble kept
 * landing clipped behind the composer (VC-052). What is left is the measurement, and the reason
 * it is worth a test of its own is the axis: the list is NOT inverted, so "at the bottom" is the
 * END of the content, not offset 0. Getting that backwards would put the button on screen
 * permanently, or never.
 */
import {
  AT_BOTTOM_SLOP_PX,
  distanceFromBottom,
  isAtBottom,
} from '../autoScroll';

const WINDOW = 800;

describe('isAtBottom', () => {
  it('is true when the content ends exactly at the fold', () => {
    expect(
      isAtBottom({ offsetY: 1200, layoutHeight: WINDOW, contentHeight: 2000 }),
    ).toBe(true);
  });

  it('is true for a short conversation that does not fill the window', () => {
    // contentHeight < layoutHeight: there is nothing to scroll, so the newest message is on
    // screen by definition and the button must stay away.
    expect(
      isAtBottom({ offsetY: 0, layoutHeight: WINDOW, contentHeight: 300 }),
    ).toBe(true);
  });

  it('tolerates the few pixels of drift that still count as the bottom', () => {
    expect(
      isAtBottom({
        offsetY: 1200 - AT_BOTTOM_SLOP_PX + 1,
        layoutHeight: WINDOW,
        contentHeight: 2000,
      }),
    ).toBe(true);
  });

  it('is false once the reader has scrolled up into history', () => {
    expect(
      isAtBottom({ offsetY: 200, layoutHeight: WINDOW, contentHeight: 5000 }),
    ).toBe(false);
  });

  it('is not fooled by an over-scroll bounce past the end', () => {
    // iOS rubber-band drives offset past the end; a negative distance must not read as "miles
    // from the bottom" once it is clamped.
    expect(
      distanceFromBottom({
        offsetY: 1400,
        layoutHeight: WINDOW,
        contentHeight: 2000,
      }),
    ).toBe(0);
  });
});
