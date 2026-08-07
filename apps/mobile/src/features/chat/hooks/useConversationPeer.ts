/**
 * Resolve a DM's peer account id (the other member) so the chat list + header can show that
 * user's profile photo. The conversation row stores no peer id, so we look up the member list
 * once and cache it in-module (keyed by conversationId) — subsequent renders/rows are free.
 * No-op for a missing id (pass undefined for groups/self so it never fetches). Best-effort:
 * a failure just leaves the DP as a coloured initial.
 */
import { useEffect, useState } from 'react';
import { getConversationMembers, getAccountId } from '../../../infra';

const peerCache = new Map<string, string>();

export function useConversationPeer(
  conversationId: string | undefined,
): string | undefined {
  const [peer, setPeer] = useState<string | undefined>(() =>
    conversationId ? peerCache.get(conversationId) : undefined,
  );

  useEffect(() => {
    if (!conversationId) return undefined;
    const cached = peerCache.get(conversationId);
    if (cached) {
      setPeer(cached);
      return undefined;
    }
    let alive = true;
    void (async () => {
      try {
        const members = await getConversationMembers(conversationId);
        const me = getAccountId();
        const other = members.find(m => m !== me) ?? members[0];
        if (other) {
          peerCache.set(conversationId, other);
          if (alive) setPeer(other);
        }
      } catch {
        // best-effort: no peer → the row shows a coloured initial
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  return peer;
}
