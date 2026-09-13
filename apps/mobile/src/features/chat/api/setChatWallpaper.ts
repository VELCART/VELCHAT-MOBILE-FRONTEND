/**
 * Persist a chat's wallpaper choice (§F2).
 *
 * Lives in the feature's api layer because `features/*​/ui` must not reach into infra directly
 * (§M3/§M4, enforced by eslint-plugin-boundaries). Local-only: the column is a per-device
 * preference, so there is nothing to send to the server and nothing to wait for — the thread
 * repaints from the row observer as soon as this lands.
 */
import { upsertConversation } from '../../../infra';
import type { WallpaperId } from '../model/wallpaper';

export function setChatWallpaper(
  conversationId: string,
  wallpaper: WallpaperId,
): Promise<void> {
  return upsertConversation(conversationId, { wallpaper });
}
