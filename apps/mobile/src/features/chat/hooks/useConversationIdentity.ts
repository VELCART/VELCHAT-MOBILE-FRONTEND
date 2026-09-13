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
import { observeConversation } from '../../../infra';
import { discoveredContacts, peerDisplayName } from '../../contacts';
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
    let sub: { unsubscribe: () => void } | undefined;
    try {
      sub = observeConversation(conversationId).subscribe(rows => {
        const row = rows[0];
        if (!row) return;
        setIdentity({
          peerId: row.peerId,
          peerAvatarUrl: row.peerAvatarUrl,
          // The header shows the name the USER saved, matching the chat list (VC-047).
          name: peerDisplayName(discoveredContacts(), row.peerId, row.name),
          wallpaper: resolveWallpaperId(row.wallpaper),
        });
        // Fire-and-forget: never blocks the header, and no-ops unless the cache is stale.
        void refreshPeerIdentity(conversationId, row.peerId);
      });
    } catch {
      setIdentity(EMPTY);
    }
    return () => sub?.unsubscribe();
  }, [conversationId]);

  return identity;
}
