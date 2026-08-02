/**
 * Start (or resume) a DM with a peer (§F2, §M0). The backend has NO inbox endpoint, so the
 * flow is: create the DM server-side (idempotent, deterministic id) → resolve the peer's
 * display name (best-effort) → upsert a LOCAL conversation row keyed by that server id. The
 * chat list observes the local DB, so the DM appears the instant the upsert lands.
 *
 * Layer note: this is feature code (features/chat/api), so it may reuse the user directory
 * (features/user barrel, feature→feature) and infra — never the other way round (§M3).
 */
import { createDm, upsertConversation, getAccountId } from '../../../infra';
import { getProfile } from '../../user';

/**
 * Create-or-resolve a DM with `peerAccountId` and return the (deterministic) conversationId.
 * When `preferredName` is given (the user's own saved contact name, the WhatsApp way) it names
 * the chat directly — no directory round-trip. Otherwise the peer-name resolution is
 * best-effort and non-fatal: a slow/failed profile read just leaves the row named by the peer
 * id (a later resolution can refine it). Throws if there is no signed-in account or the peer id
 * is blank (the UI surfaces a friendly message).
 */
export async function startDm(
  peerAccountId: string,
  preferredName?: string,
): Promise<string> {
  const me = getAccountId();
  if (!me) throw new Error('Not signed in.');
  const peer = peerAccountId.trim();
  if (!peer) throw new Error('Enter an account ID.');

  const { conversationId } = await createDm(me, peer);

  let name = preferredName?.trim() || peer;
  if (!preferredName?.trim()) {
    try {
      const profile = await getProfile(peer);
      if (profile.displayName && profile.displayName.trim() !== '') {
        name = profile.displayName;
      }
    } catch {
      // Best-effort: fall back to the peer id as the conversation name.
    }
  }

  await upsertConversation(conversationId, { type: 'dm', name });
  return conversationId;
}
