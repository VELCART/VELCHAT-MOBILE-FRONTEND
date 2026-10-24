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

  it('names seq — the column the window is ORDERED by', () => {
    // A row can learn its real seq after it is on screen (a live frame arriving before the
    // ack, then the reconcile update). On an already-delivered row nothing else changes, so
    // without this the list keeps drawing the old order.
    expect(MESSAGE_OBSERVED_COLUMNS).toContain('seq');
  });

  it('names created_at — the timestamp the bubble prints', () => {
    // `applyServerMessages` re-stamps it to the server's time in either direction (VC-030).
    // Unobserved, a corrected time appears only on the next visit — and a correction across
    // midnight strands the bubble under the wrong date separator.
    expect(MESSAGE_OBSERVED_COLUMNS).toContain('created_at');
  });

  it('does not name columns nothing on screen reads', () => {
    // Every extra column is another reason to re-render the whole visible window on the app's
    // most-used screen (§R4). `server_msg_id` is wire plumbing and `reply_to_id` is written
    // once at insert — neither is ever a later change the reader must see.
    expect(MESSAGE_OBSERVED_COLUMNS).not.toContain('server_msg_id');
    expect(MESSAGE_OBSERVED_COLUMNS).not.toContain('reply_to_id');
  });
});
