/**
 * Presence REST surface (§A15 / §B8, presence-service via the gateway `/presence/*`).
 *
 *   - `getPresence(userId, viewerId?, viewerIsContact?)` → GET /presence/:userId — the owner's
 *     privacy is enforced server-side when a `viewerId` is supplied (a hidden signal collapses to
 *     `offline` / strips `lastSeen`). Response `{ status, emoji?, text?, lastSeen }`.
 *   - `subscribePresence(watcher, targets[])` → POST /presence/subscribe — fan-out targets
 *     subscribers only (§A15.2); call it for the on-screen DM peer when a chat opens.
 *
 * Pure payload parsing (+ the live-frame `normalizePresenceEvent`) lives in `presenceShape.ts`.
 * NOTE: the running realtime-gateway does not currently fan `presence.changed` to sockets (its
 * FanoutConsumer subscribes to message/receipt/caption only), so the REST snapshot is the reliable
 * path today; the WS normaliser is forward-compatible for when live presence push lands.
 */
import { api } from './client';
import { normalizePresence, type PresenceResult } from './presenceShape';

/**
 * Resolve a peer's rich presence + last-seen. Pass `viewerId` (= me) so the owner's last-seen/online
 * privacy is applied; `viewerIsContact` refines the "contacts-only" mode (defaults to unknown/false).
 */
export async function getPresence(
  userId: string,
  viewerId?: string,
  viewerIsContact?: boolean,
): Promise<PresenceResult> {
  const params: Record<string, string> = {};
  if (viewerId) {
    params.viewerId = viewerId;
    if (viewerIsContact !== undefined) {
      params.viewerIsContact = String(viewerIsContact);
    }
  }
  const res = await api.get(`/presence/${encodeURIComponent(userId)}`, {
    params,
  });
  return normalizePresence(res.data);
}

/** Subscribe `watcher` to the live presence of `targets` (the on-screen contacts / DM peer). */
export async function subscribePresence(
  watcher: string,
  targets: string[],
): Promise<void> {
  await api.post('/presence/subscribe', { watcher, targets });
}

export { normalizePresenceEvent } from './presenceShape';
export type { PresenceResult, PresenceEvent } from './presenceShape';
