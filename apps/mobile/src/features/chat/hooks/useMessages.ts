/**
 * Observe a conversation's messages from the local DB + send optimistically (§F2/§L7).
 * The UI never waits on the network: a send writes to the DB and the list re-renders at
 * once; the MP2 outbox transmits + reconciles later.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  observeMessages,
  getAccountId,
  countMessages,
  MESSAGE_PAGE,
  Message,
  clearConversationNotification,
  setActiveConversationForPush,
} from '../../../infra';
import { syncEngine } from '../../../domain/sync';

export function useMessages(conversationId: string): {
  messages: Message[];
  meId: string;
  /** Reveal the previous page of history — call when the user scrolls past the oldest bubble. */
  loadOlder: () => void;
} {
  const meId = useMemo(() => getAccountId() ?? 'me', []);
  const [messages, setMessages] = useState<Message[]>([]);
  // The window grows; it never shrinks while the chat is open, so scrolling back up does not
  // re-drop history the user just pulled in.
  const [limit, setLimit] = useState(MESSAGE_PAGE);
  const loadingOlder = useRef(false);

  useEffect(() => {
    setLimit(MESSAGE_PAGE); // a different conversation starts from one page again
  }, [conversationId]);

  /**
   * Grow the local window, and only when the DB has no more to give, reach back to the server.
   * Without this the list simply ENDED at 50 bubbles — scrolling up in a long chat hit a wall
   * with no way to ever see anything older.
   */
  const loadOlder = useCallback(() => {
    if (loadingOlder.current) return;
    loadingOlder.current = true;
    void (async () => {
      try {
        const held = await countMessages(conversationId);
        if (held > limit) {
          setLimit(l => l + MESSAGE_PAGE); // still paging through what we already hold
          return;
        }
        const grew = await syncEngine.loadOlderMessages(
          conversationId,
          MESSAGE_PAGE,
        );
        if (grew) setLimit(l => l + MESSAGE_PAGE);
      } catch {
        // Offline or the server has nothing older — the window simply stays where it is.
      } finally {
        loadingOlder.current = false;
      }
    })();
  }, [conversationId, limit]);

  // Opening the chat is a ONE-TIME act, so it keys on the conversation and nothing else.
  //
  // All of this used to share an effect with the subscription below, which also depends on
  // `limit` — so every `loadOlder` page tore it all down and ran it again: a receipts GET and a
  // read frame per page of scrollback, and the pair `setActiveConversationForPush(null)` →
  // `…(conversationId)`. That bridge hop is ASYNC, so for one native round trip the native side
  // believed NO chat was on screen, and a push landing inside that window posted a heads-up
  // notification for the chat the user was reading — the exact thing this mechanism exists to
  // prevent (VC-068). Ten pages of history was ten such windows.
  useEffect(() => {
    // Opening the chat = read it: clear the unread badge locally + tell the server (§F2).
    // Telling the engine this chat is ON SCREEN is what keeps that true for messages that arrive
    // WHILE it is open — otherwise the badge climbs on the conversation the user is reading and
    // the sender's ticks never turn blue, because the read was only ever reported once, at mount.
    syncEngine.setActiveConversation(conversationId);
    void syncEngine.markConversationRead(conversationId);
    // The tray notification for this chat is stale the instant it is on screen — and it is
    // still there after a notification TAP, because tapping opens the app without clearing the
    // stacked "3 new messages" counter behind it.
    clearConversationNotification(conversationId);
    // Repair ticks the socket could not deliver. A receipt published while this device was
    // reconnecting is gone — nothing re-derives it — so a bubble can sit on one tick long after
    // the peer read it. Opening the chat is exactly when that is visible, and the durable answer
    // is one cheap read away. Never throws.
    void syncEngine.reconcilePeerReceipts(conversationId);
    // Native suppresses a push only for the chat on screen, so it has to be told which
    // one that is — and told again (null) on leaving, or this chat stays silent.
    setActiveConversationForPush(conversationId);
    // "On screen" must mean VISIBLE, not merely "last opened", and that applies to the ENGINE
    // as much as to the push layer. The engine reads every message that lands in its active
    // conversation on arrival; it only ever cleared that id on UNMOUNT, and backgrounding does
    // not unmount — so an app left sitting on a chat behind a locked screen went on marking
    // arriving messages read, and the sender got a blue tick for a message nobody had looked at.
    // Withdraw both on leaving the foreground, re-assert both on return.
    const appStateSub = AppState.addEventListener('change', state => {
      const visible = state === 'active';
      setActiveConversationForPush(visible ? conversationId : null);
      syncEngine.setActiveConversation(visible ? conversationId : null);
      if (!visible) return;
      // Coming back to a chat that is on screen is a read, and it has to be reported here:
      // everything below runs only on mount, and a notification TAP resumes an ALREADY-MOUNTED
      // screen, so the mount effect never re-runs on the one path that most needs it.
      void syncEngine.markConversationRead(conversationId);
      // Same reason the tray still held lines the user had read: AUTO_CANCEL removes the posted
      // notification on tap but runs none of our clearing, so the stored MessagingStyle lines
      // survived to be rebuilt into the next one.
      clearConversationNotification(conversationId);
    });
    return () => {
      appStateSub.remove();
      syncEngine.setActiveConversation(null);
      setActiveConversationForPush(null);
    };
  }, [conversationId]);

  // The only thing a wider window changes: re-run the query, release the narrower one. `meId` was
  // never read by either half — it is a stable account id, and keeping it in the array only ever
  // meant more ways to re-run all of the above.
  useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    try {
      sub = observeMessages(conversationId, limit).subscribe(setMessages);
    } catch {
      setMessages([]);
    }
    return () => sub?.unsubscribe();
  }, [conversationId, limit]);
  return { messages, meId, loadOlder };
}

/** Retry a permanently-failed send (tapped from the bubble) — re-queues the same message. */
export function useRetrySend(): (clientMsgId: string) => void {
  return useCallback((clientMsgId: string) => {
    void syncEngine.retrySend(clientMsgId);
  }, []);
}

export function useSendMessage(conversationId: string): (text: string) => void {
  const meId = useMemo(() => getAccountId() ?? 'me', []);
  return useCallback(
    (text: string) => {
      // Fire-and-forget: the engine writes the optimistic bubble to the DB (instant UI),
      // enqueues the durable outbox item, and transmits off the render path (§L6/§L7).
      void syncEngine.sendText(conversationId, meId, text);
    },
    [conversationId, meId],
  );
}
