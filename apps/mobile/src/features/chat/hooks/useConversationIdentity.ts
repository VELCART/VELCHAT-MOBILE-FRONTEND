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
}

const EMPTY: ConversationIdentity = {
  peerId: undefined,
  peerAvatarUrl: undefined,
  name: undefined,
  wallpaper: 'plain',
};

export function useConversationIdentity(
  conversationId: string,
): ConversationIdentity {
  const [identity, setIdentity] = useState<ConversationIdentity>(EMPTY);

  useEffect(() => {
    setIdentity(EMPTY);
    // The row we are currently drawing. Held because the header has to be able to re-title
    // itself when the ADDRESS BOOK changes: the saved name is not on this row and never will be,
    // so the observable will not emit again to deliver it (VC-044).
    let row: Conversation | undefined;
    // The sweep is asked for once per open, not once per message that lands in the chat.
    let asked = false;

    const publish = (): void => {
      if (!row) return;
      setIdentity({
        peerId: row.peerId,
        peerAvatarUrl: row.peerAvatarUrl,
        // The header shows the name the USER saved, matching the chat list (VC-047).
        name: peerDisplayName(discoveredContacts(), row.peerId, row.name),
        wallpaper: resolveWallpaperId(row.wallpaper),
      });
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
