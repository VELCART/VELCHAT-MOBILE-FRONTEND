/**
 * `observeConversation` must NAME every column the chat screen reads off the row.
 *
 * WatermelonDB's `observeWithColumns` only wakes for the columns it is given. A column the UI
 * reads but the subscription does not name looks permanently stale: the write lands in the
 * database, nothing re-emits, and the change only appears once the subscription is recreated —
 * i.e. after leaving the screen and coming back. That is exactly how the chat wallpaper
 * behaved when it was added to the row but not to this list.
 *
 * This asserts the column LIST rather than an emission on purpose: WatermelonDB observables do
 * not emit under the Loki adapter Jest uses (the sibling messageWindow/messageOrdering tests
 * document the same limitation and read with `.fetch()` instead), so an emission-based test
 * here fails identically whether the bug is present or not — it would prove nothing.
 */
import {
  CONVERSATION_OBSERVED_COLUMNS,
  CONVERSATION_IDENTITY_COLUMNS,
} from '../queries';

describe('observeConversation column coverage', () => {
  it('observes every column the chat header and wallpaper read', () => {
    for (const column of CONVERSATION_IDENTITY_COLUMNS) {
      expect(CONVERSATION_OBSERVED_COLUMNS).toContain(column);
    }
  });

  it('names the wallpaper column — the one that was missed', () => {
    expect(CONVERSATION_OBSERVED_COLUMNS).toContain('wallpaper');
  });
});
