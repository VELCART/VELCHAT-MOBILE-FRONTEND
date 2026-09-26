/**
 * Is the peer typing in this conversation? (§C4)
 *
 * A pure READ of the live typing store — no subscription to activate, nothing to tear down.
 * It exists separately from `useChatHeaderPresence` because that hook OWNS the presence
 * subscription (`activatePresence` on mount, `deactivatePresence` on unmount), so calling it a
 * second time to get at the same boolean would hand one conversation two owners for one
 * resource, and whichever unmounted first would cancel the other's presence (§M7).
 */
import { useTypingUser } from '../../../core';

export function useConversationTyping(conversationId: string): boolean {
  return useTypingUser(conversationId) !== null;
}
