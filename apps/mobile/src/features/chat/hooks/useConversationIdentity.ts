/**
 * A conversation's identity (peer, name, photo) read from the LOCAL row (§M0 rules 2 + 3).
 *
 * The inbox sync resolves a DM's peer and picture once and stores them on the row, so opening a
 * chat draws the header immediately with no request in flight. Resolving it here instead — a
 * members lookup, a profile, a media URL — put three round-trips between the tap and a complete
 * header, which is exactly the wait this app is not allowed to have.
 *
 * Freshness is not sacrificed for it: a cached identity older than its TTL is revalidated in the
 * background, and because the row is observed, a changed photo appears on its own.
 */
import { useEffect, useState } from 'react';
import { observeConversation, type Conversation } from '../../../infra';
import {
  discoveredContacts,
  peerDisplayName,
  requestContactsRefresh,
  subscribeDiscoveredContacts,
} from '../../contacts';
import { resolveWallpaperId, type WallpaperId } from '../model/wallpaper';
import { refreshPeerIdentity } from '../api/refreshPeerIdentity';

export interface ConversationIdentity {
  readonly peerId: string | undefined;
  readonly peerAvatarUrl: string | undefined;
  readonly name: string | undefined;
  /** Chat wallpaper (§F2), resolved from the row — `plain` until someone picks another. */
  readonly wallpaper: WallpaperId;
  /**
   * Has the local row actually been READ yet? Without this the caller cannot tell "this
   * conversation has no name" from "we have not looked" — and the difference is visible: the
   * header rendered the words "Unknown contact" for a frame on every open reached from a
   * notification, which carries no name in its route.
   */
  readonly resolved: boolean;
}

const EMPTY: ConversationIdentity = {
  peerId: undefined,
  peerAvatarUrl: undefined,
  name: undefined,
  wallpaper: 'plain',
  resolved: false,
};

/**
 * The last identity each conversation published, so RE-opening one paints its wallpaper and its
 * name on the first frame instead of one DB emission later.
 *
 * Opening a chat used to start from `EMPTY` every time, which means `wallpaper: 'plain'` — so a
 * chat set to `blush` painted a white (or black) ground, then repainted pink a frame later.
 * Every open. The observable is the source of truth and overwrites this the moment it emits;
 * this only decides what is on screen until then.
 *
 * BOUNDED (§M0 — no unbounded caches). Oldest-inserted is evicted, which for chat-switching is
 * near enough to least-recently-used, and the cost of a miss is exactly the behaviour that
 * shipped before.
 */
const RECENT_LIMIT = 32;
const recent = new Map<string, ConversationIdentity>();

function remember(
  conversationId: string,
  identity: ConversationIdentity,
): void {
  recent.delete(conversationId);
  recent.set(conversationId, identity);
  if (recent.size > RECENT_LIMIT) {
    const oldest = recent.keys().next();
    if (!oldest.done) recent.delete(oldest.value);
  }
}

export function useConversationIdentity(
  conversationId: string,
): ConversationIdentity {
  const [identity, setIdentity] = useState<ConversationIdentity>(
    () => recent.get(conversationId) ?? EMPTY,
  );

  useEffect(() => {
    setIdentity(recent.get(conversationId) ?? EMPTY);
    // The row we are currently drawing. Held because the header has to be able to re-title
    // itself when the ADDRESS BOOK changes: the saved name is not on this row and never will be,
    // so the observable will not emit again to deliver it (VC-044).
    let row: Conversation | undefined;
    // The sweep is asked for once per open, not once per message that lands in the chat.
    let asked = false;

    const publish = (): void => {
      if (!row) return;
      const next: ConversationIdentity = {
        peerId: row.peerId,
        peerAvatarUrl: row.peerAvatarUrl,
        // The header shows the name the USER saved, matching the chat list (VC-047).
        name: peerDisplayName(discoveredContacts(), row.peerId, row.name),
        wallpaper: resolveWallpaperId(row.wallpaper),
        resolved: true,
      };
      remember(conversationId, next);
      setIdentity(next);
    };

    let sub: { unsubscribe: () => void } | undefined;
    try {
      sub = observeConversation(conversationId).subscribe(rows => {
        const next = rows[0];
        if (!next) return;
        row = next;
        publish();
        // Fire-and-forget: never blocks the header, and no-ops unless the cache is stale.
        void refreshPeerIdentity(conversationId, next.peerId);
        // Opening a chat on someone we cannot name is the case this whole bug is about: they
        // may have been saved in the phone since the last sweep. Also fire-and-forget, also
        // gated and throttled inside — the header never waits on it (§M0 rule 2).
        if (!asked) {
          asked = true;
          requestContactsRefresh([next.peerId], 'chat-open');
        }
      });
    } catch {
      setIdentity(EMPTY);
    }

    const unsubscribeContacts = subscribeDiscoveredContacts(publish);
    return () => {
      sub?.unsubscribe();
      unsubscribeContacts();
    };
  }, [conversationId]);

  return identity;
}
