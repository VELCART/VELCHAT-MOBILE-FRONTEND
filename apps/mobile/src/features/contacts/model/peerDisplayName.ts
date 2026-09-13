/**
 * Which name a DM shows (§F2). Pure — no I/O, no React.
 *
 * The address book wins. If you saved someone as "Aayush Sir", that is what you see, whatever
 * they registered on VelChat as — the WhatsApp behaviour users expect. Everything that writes a
 * conversation's name goes through here, because the defect was not one bad write but a split
 * rule: the New-Chat path used the saved name while every other path (inbound message, inbox
 * backfill, the background identity revalidation) used the registered one, so the same chat was
 * titled differently depending on how it happened to be created — and a revalidation could
 * downgrade a saved name back to the registered one an hour later (VC-044, VC-047).
 *
 * PRIVACY: this module must never log — the values are address-book names (§M19).
 */
import type { VelchatContact } from './contactLists';

const trimmed = (value: string | undefined): string | undefined => {
  const out = value?.trim();
  return out ? out : undefined;
};

/**
 * @param contacts discovered address-book matches, or `null` when the book has not loaded yet
 *                 (permission not granted, first run, or discovery still in flight)
 * @param accountId the peer
 * @param serverName the peer's registered display name
 * @returns the name to show, or `undefined` when neither side offers a usable one — callers
 *          treat that as "keep whatever is already on the row" rather than blanking the title.
 */
export function peerDisplayName(
  contacts: readonly VelchatContact[] | null | undefined,
  accountId: string | undefined,
  serverName: string | undefined,
): string | undefined {
  if (accountId && contacts) {
    for (const c of contacts) {
      if (c.accountId !== accountId) continue;
      const saved = trimmed(c.name);
      if (saved) return saved;
      break; // in the book but unnamed — fall through to the registered name
    }
  }
  return trimmed(serverName);
}
