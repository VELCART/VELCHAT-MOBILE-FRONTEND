/**
 * `observeMessages` must NAME every column a bubble's content is drawn from (VC-063).
 *
 * WatermelonDB re-emits only when the matched-record SET changes or a NAMED column does. A
 * fan-out frame carrying no body inserts the row — a set change, so the blank bubble appears —
 * and the REST refill that follows writes `content_plain` on that already-matched row. With only
 * `state` observed, that write lands in the database and nothing re-renders: the message is
 * there, the text is there, and the user sees an empty bubble until they leave the chat and come
 * back. The body itself is the other half of that defect; this is the half that shows it.
 *
 * Asserted as a column LIST rather than an emission on purpose: WatermelonDB observables do not
 * emit under the Loki adapter Jest uses (see the sibling observeConversation/messageWindow
 * tests), so an emission-based test here would fail identically whether the bug is present or
 * not — it would prove nothing.
 */
import { MESSAGE_OBSERVED_COLUMNS } from '../messages';

describe('observeMessages column coverage', () => {
  it('names content_plain — the column a late body refill writes', () => {
    expect(MESSAGE_OBSERVED_COLUMNS).toContain('content_plain');
  });

  it('still names state, so a bubble keeps ticking sending → sent → read', () => {
    expect(MESSAGE_OBSERVED_COLUMNS).toContain('state');
  });
});
