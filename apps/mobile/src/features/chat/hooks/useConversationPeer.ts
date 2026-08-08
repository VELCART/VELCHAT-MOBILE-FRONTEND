/**
 * Resolve a DM's peer account id (the other member) so the chat list + header can show that
 * user's profile photo. The conversation row stores no peer id, so we look up the member list
 * once and cache it in-module (keyed by conversationId) — subsequent renders/rows are free.
 *
 * RECYCLE-SAFE: like useContactAvatar, the value is derived from the cache for the CURRENT
 * conversationId on every render (never held in stale state), so a recycled FlashList row can
 * never show the previous conversation's peer/photo. A bump forces a re-read after resolve.
 * No-op for a missing id (pass undefined for groups/self). Best-effort; failure → no peer.
 */
import { useEffect, useState } from 'react';
import { getConversationMembers, getAccountId } from '../../../infra';

const peerCache = new Map<string, string>();
const resolving = new Set<string>(); // in-flight guard (one members fetch per conversation)

export function useConversationPeer(
  conversationId: string | undefined,
): string | undefined {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!conversationId) return undefined;
    if (peerCache.has(conversationId) || resolving.has(conversationId)) {
      return undefined;
    }
    let alive = true;
    resolving.add(conversationId);
    void (async () => {
      try {
        const members = await getConversationMembers(conversationId);
        const me = getAccountId();
        const other = members.find(m => m !== me) ?? members[0];
        if (other) peerCache.set(conversationId, other);
      } catch {
        // best-effort: no peer → the row shows a coloured initial
      } finally {
        resolving.delete(conversationId);
        if (alive) bump(n => (n + 1) % 1_000_000);
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  // ALWAYS read for the CURRENT conversationId — never stale state from a recycled row.
  return conversationId ? peerCache.get(conversationId) : undefined;
}
