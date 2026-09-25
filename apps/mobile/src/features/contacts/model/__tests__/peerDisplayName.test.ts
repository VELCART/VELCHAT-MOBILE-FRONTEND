/**
 * QA regression guard — the name on a DM is the one in YOUR address book (VC-044, VC-047).
 *
 * WhatsApp-parity rule: if you saved someone as "Aayush Sir", that is what you see, whatever
 * they registered as. The address book was only ever consulted on the New-Chat path, so a
 * conversation that arrived any other way (an inbound message, the inbox backfill) showed the
 * registered name — and `refreshPeerIdentity` then actively overwrote a local name with the
 * registered one on the next background revalidation.
 *
 * PRIVACY: fixtures use obviously-fake names/ids; never log a real name or number.
 */
import { peerDisplayName, sameContactNames } from '../peerDisplayName';
import type { VelchatContact } from '../contactLists';

const contact = (accountId: string, name: string): VelchatContact => ({
  key: `k_${accountId}`,
  accountId,
  name,
  phoneE164: '+910000000000',
});

const book: VelchatContact[] = [
  contact('acct_1', 'Aayush Sir'),
  contact('acct_2', 'Mum'),
];

describe('VC-044 / VC-047 — which name a DM shows', () => {
  it('the exact defect: the saved contact name wins over the registered one', () => {
    expect(peerDisplayName(book, 'acct_1', 'Aayush Jain')).toBe('Aayush Sir');
  });

  it('falls back to the registered name for someone not in the address book', () => {
    expect(peerDisplayName(book, 'acct_99', 'Stranger')).toBe('Stranger');
  });

  it('falls back to the registered name when the book has not loaded yet', () => {
    expect(peerDisplayName(null, 'acct_1', 'Aayush Jain')).toBe('Aayush Jain');
  });

  it('ignores a blank address-book name rather than showing an empty chat title', () => {
    expect(
      peerDisplayName([contact('acct_3', '   ')], 'acct_3', 'Real Name'),
    ).toBe('Real Name');
  });

  it('returns undefined when neither side has a usable name, so the caller keeps what it has', () => {
    expect(peerDisplayName(book, 'acct_99', '  ')).toBeUndefined();
    expect(peerDisplayName(book, undefined, undefined)).toBeUndefined();
  });

  it('trims a saved name so the list never renders stray whitespace', () => {
    expect(peerDisplayName([contact('acct_4', '  Dad  ')], 'acct_4', 'D')).toBe(
      'Dad',
    );
  });
});

/**
 * The other half of VC-044: a name the user has just saved has to REACH an already-mounted
 * screen. Nothing else will bring it — the name lives in the phone's address book, so the DB row
 * the chat list observes has not changed and never will. The snapshot therefore notifies its
 * readers, and this predicate is the gate on that notification: waking every mounted chat row
 * for a discovery run that learned nothing is an avoidable render on the reference device (§R4).
 */
describe('VC-044 — has anything a DM could be titled with changed?', () => {
  it('is quiet when the same book comes back from a re-run', () => {
    expect(sameContactNames(book, [...book])).toBe(true);
  });

  it('notices a contact renamed in the phone', () => {
    const renamed = [contact('acct_1', 'Aayush'), contact('acct_2', 'Mum')];
    expect(sameContactNames(book, renamed)).toBe(false);
  });

  it('notices the newly saved contact that the whole defect is about', () => {
    expect(sameContactNames(book, [...book, contact('acct_3', 'Tusha')])).toBe(
      false,
    );
  });

  it('notices a contact deleted from the phone', () => {
    expect(sameContactNames(book, [contact('acct_1', 'Aayush Sir')])).toBe(
      false,
    );
  });

  it('notices the same name moving to a different account', () => {
    const moved = [contact('acct_9', 'Aayush Sir'), contact('acct_2', 'Mum')];
    expect(sameContactNames(book, moved)).toBe(false);
  });

  it('ignores everything a title does not read — a new photo is not a re-render', () => {
    const rephotographed = book.map(c => ({ ...c, thumbnailPath: '/new.jpg' }));
    expect(sameContactNames(book, rephotographed)).toBe(true);
  });
});
