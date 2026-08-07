/**
 * Header presence line state (§A15/§C4). On mount it activates presence for the conversation
 * (SyncEngine resolves the DM peer, subscribes, and fetches the snapshot into the live store),
 * then reactively reads the peer's presence + this conversation's typing indicator. Returns
 * primitives so `ChatHeader` stays a dumb renderer. Groups resolve to no peer → no presence line.
 */
import { useEffect, useState } from 'react';
import { syncEngine } from '../../../domain/sync';
import { usePresence, useTypingUser, type PresenceEntry } from '../../../core';

export type { PresenceEntry };

export function useChatHeaderPresence(conversationId: string): {
  typing: boolean;
  presence: PresenceEntry | undefined;
  peerId: string | null;
} {
  const [peerId, setPeerId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void syncEngine
      .activatePresence(conversationId)
      .then(pid => {
        if (alive) setPeerId(pid);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      syncEngine.deactivatePresence(conversationId);
      setPeerId(null);
    };
  }, [conversationId]);

  const typingUser = useTypingUser(conversationId);
  const presence = usePresence(peerId);
  return { typing: typingUser !== null, presence, peerId };
}
