/**
 * Is the reader at the bottom of the chat? Pure — no React, no refs.
 *
 * This is ONLY used to decide whether to show the jump-to-latest button. Following the newest
 * message is no longer decided here: FlashList owns it through
 * `maintainVisibleContentPosition.autoscrollToBottomThreshold`, which pins the list to the end
 * whenever the reader is near it. Three hand-rolled attempts at the same thing all lost a race
 * against the library's own scroll-anchor correction and left the newest bubble clipped behind
 * the composer — see the comment on the list in `ChatScreen`.
 */

/**
 * How far from the bottom still counts as "at the bottom". Small: a few pixels of rubber-band or
 * a half-settled momentum scroll must not put a button on screen, but an actual scroll away from
 * the latest message should.
 */
export const AT_BOTTOM_SLOP_PX = 80;

export interface ScrollMetrics {
  /** Current scroll offset from the top of the content. */
  readonly offsetY: number;
  /** Height of the visible window. */
  readonly layoutHeight: number;
  /** Total height of the content. */
  readonly contentHeight: number;
}

/** Pixels of content still below the fold. Never negative (over-scroll bounces past the end). */
export function distanceFromBottom(m: ScrollMetrics): number {
  return Math.max(0, m.contentHeight - (m.offsetY + m.layoutHeight));
}

/**
 * True while the newest message is on screen (or as good as). The chat list is NOT inverted, so
 * the newest message is at the END of the content — which is why this measures against the
 * content height rather than treating offset 0 as "latest".
 */
export function isAtBottom(m: ScrollMetrics): boolean {
  return distanceFromBottom(m) <= AT_BOTTOM_SLOP_PX;
}
