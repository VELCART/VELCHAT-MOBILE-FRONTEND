/**
 * Observe the chat list from the local DB (§F2, §M0). The UI reads WatermelonDB, never
 * the network — an instant, offline-first render that reacts to every DB write. Real
 * conversations arrive from `startDm` + the sync engine + the inbox backfill; empty until
 * the user starts/receives their first chat (no dev seed — the list is always real data).
 *
 * The hook hands the UI PLAIN ROW VIEW-MODELS, not the DB models: WatermelonDB mutates its
 * cached model IN PLACE and re-emits the SAME object reference, so anything memoised on the
 * model (our `Row`, and FlashList's own ViewHolder `prevProps.item === nextProps.item`)
 * would never see a cleared unread badge or a new preview on the chat already at the top.
 * Snapshotting primitives per emission makes the memo correct — the same trap MessageBubble
 * documents.
 */
import { useEffect, useState } from 'react';
import {
  observeConversations,
  subscribeAppState,
  Conversation,
} from '../../../infra';
import {
  discoveredContacts,
  peerDisplayName,
  requestContactsRefresh,
  subscribeDiscoveredContacts,
  type VelchatContact,
} from '../../contacts';

/** One chat-list row, as the UI renders it. Immutable primitives only — never a DB model. */
export interface ConversationRowVM {
  readonly id: string;
  readonly type: string;
  readonly name: string | undefined;
  readonly preview: string;
  readonly unread: number;
  readonly pinned: boolean;
  /**
   * Rendered timestamp, resolved at EMISSION time. `toLocaleTimeString`/`toLocaleDateString`
   * are ICU calls over JNI on Hermes — far too slow to run per row per render (§R4), and the
   * label only changes when the row does. Trade-off: an app left open across midnight keeps
   * yesterday's buckets until the next DB emission (which memoised rows did anyway).
   */
  readonly time: string;
  /** The DM's other member, resolved at sync time — never looked up while rendering. */
  readonly peerId: string | undefined;
  /** That peer's photo URL, already resolved. Absent → the row draws a coloured initial. */
  readonly peerAvatarUrl: string | undefined;
}

export interface ConversationsState {
  readonly rows: readonly ConversationRowVM[];
  /**
   * False until the FIRST subscription emission. Without this the list renders its
   * "no chats yet" empty state on every cold start / tab mount and then swaps to the
   * rows — a visible flash of the wrong screen.
   */
  readonly loaded: boolean;
}

const INITIAL: ConversationsState = { rows: [], loaded: false };

/** Compact WhatsApp-style timestamp: HH:MM today, else a short date. `now` = emission time. */
export function conversationTimeLabel(
  ts: number | undefined,
  now: number,
): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Snapshot a DB model into a row view-model. Pure — the unit of the memo contract above.
 *
 * `contacts` are the discovered address-book matches (`null` when the book has not loaded).
 * Resolving the title HERE rather than trusting the stored row is what makes the saved name
 * appear without having to open the chat first: the row carries whatever the server said, and
 * the name a DM is shown under is the user's own (VC-044 / VC-047).
 */
export function toConversationRow(
  c: Conversation,
  now: number,
  contacts: readonly VelchatContact[] | null = null,
): ConversationRowVM {
  return {
    id: c.id,
    type: c.type,
    name: peerDisplayName(contacts, c.peerId, c.name),
    preview: c.lastMessagePreview ?? '',
    unread: c.unreadCount,
    pinned: c.isPinned,
    time: conversationTimeLabel(c.lastMessageAt, now),
    // Carried on the row itself, resolved once at sync time. A row that had to FETCH its peer and
    // photo cost three REST calls per render — which is why photos used to arrive late, in a
    // random order, or not at all, and why the list crawled on a real connection.
    peerId: c.peerId,
    peerAvatarUrl: c.peerAvatarUrl,
  };
}

export function useConversations(): ConversationsState {
  const [state, setState] = useState<ConversationsState>(INITIAL);
  useEffect(() => {
    // The newest DB emission, held for the two things that can re-title these rows WITHOUT the
    // DB saying anything: a contacts sweep landing, and the user coming back from the app where
    // they saved the contact. A DM's title lives in the phone's address book, so no server
    // write will ever re-emit the row to correct it and nothing else would re-render the list
    // (VC-044).
    let latest: Conversation[] | null = null;

    // One `now` per emission so every row is bucketed against the same instant. The address
    // book is read once per emission too — it is a cache read, and resolving it per row
    // would re-read it for every chat in the list.
    const publish = (models: Conversation[]): void => {
      const now = Date.now();
      const contacts = discoveredContacts();
      setState({
        rows: models.map(m => toConversationRow(m, now, contacts)),
        loaded: true,
      });
    };

    let sub: { unsubscribe: () => void } | undefined;
    try {
      // getDatabase() throws if the native module isn't in the binary yet (pre-rebuild) —
      // degrade to an empty list instead of crashing the tab.
      sub = observeConversations().subscribe(models => {
        latest = models;
        publish(models);
      });
    } catch {
      // Loaded-but-empty: the empty state is the correct, final answer here.
      setState({ rows: [], loaded: true });
    }

    // Re-titling costs a full re-map (the timestamp labels are ICU calls, which is why they are
    // snapshotted per emission at all), so this only fires when a name a DM could show actually
    // changed — the snapshot gates its own notification.
    const unsubscribeContacts = subscribeDiscoveredContacts(() => {
      if (latest) publish(latest);
    });

    // Returning from another app is the moment the address book may have changed under us — it
    // is where the contact was just saved. Asking HERE, rather than on every screen focus, is
    // what keeps the sweep off the §R4/§R5 hot paths; `requestContactsRefresh` drops it outright
    // unless one of these rows is a peer we cannot already name.
    const unsubscribeAppState = subscribeAppState(s => {
      if (s !== 'active' || !latest) return;
      requestContactsRefresh(
        latest.map(m => m.peerId),
        'app-returned',
      );
    });

    return () => {
      sub?.unsubscribe();
      unsubscribeContacts();
      unsubscribeAppState();
    };
  }, []);
  return state;
}
