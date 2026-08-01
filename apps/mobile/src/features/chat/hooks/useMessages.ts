/**
 * Observe a conversation's messages from the local DB + send optimistically (§F2/§L7).
 * The UI never waits on the network: a send writes to the DB and the list re-renders at
 * once; the MP2 outbox transmits + reconciles later.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  observeMessages,
  sendMessageLocal,
  seedDevMessages,
  getAccountId,
  Message,
} from '../../../infra';

export function useMessages(conversationId: string): {
  messages: Message[];
  meId: string;
} {
  const meId = useMemo(() => getAccountId() ?? 'me', []);
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    void seedDevMessages(conversationId, meId);
    const sub = observeMessages(conversationId).subscribe(setMessages);
    return () => sub.unsubscribe();
  }, [conversationId, meId]);
  return { messages, meId };
}

export function useSendMessage(conversationId: string): (text: string) => void {
  const meId = useMemo(() => getAccountId() ?? 'me', []);
  return useCallback(
    (text: string) => {
      void sendMessageLocal(conversationId, text, meId);
    },
    [conversationId, meId],
  );
}
