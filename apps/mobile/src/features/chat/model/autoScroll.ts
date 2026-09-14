/**
 * Should the chat list jump to the newest message? Pure — no React, no refs.
 *
 * The list is inverted, so "latest" is offset 0 and new rows grow the content underneath the
 * current viewport. Nothing pulled the view back, so a new message — including one the user had
 * just sent — arrived below the fold and had to be scrolled to by hand.
 *
 * Following is the default, with one deliberate exception: a reader who has scrolled up into
 * history is left where they are and offered the jump-to-latest button instead. Yanking the
 * viewport out from under someone mid-read is a worse bug than the one being fixed.
 */

/**
 * How far from the bottom still counts as "at the bottom". Small: a few pixels of rubber-band
 * or a half-settled momentum scroll should not be read as "reading history", but an actual
 * scroll away from the latest message should.
 */
export const AT_BOTTOM_SLOP_PX = 80;

export function shouldScrollToLatest(input: {
  /** True when this message is one the user just sent. */
  own: boolean;
  /** Current inverted-list offset. 0 is the newest message. */
  offsetY: number;
}): boolean {
  if (input.own) return true;
  return input.offsetY <= AT_BOTTOM_SLOP_PX;
}
