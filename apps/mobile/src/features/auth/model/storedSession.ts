/**
 * Does this device hold a session at all? (§M3 boundary.)
 *
 * A one-line re-export with a reason: `navigation/` may not reach into `infra/` directly
 * (UI → Feature → Domain → Infra, lint-enforced), and the deep-link gate in `RootNavigator`
 * needs this answer SYNCHRONOUSLY — a notification tapped from cold arrives at the navigation
 * container before the auth store has hydrated, so asking the store there would drop exactly
 * the link that path exists for.
 *
 * Presence only, deliberately: it says tokens are on the device, not that they are still valid.
 * That is the right question for "may this link be honoured" — an expired access token heals
 * itself on the next 401, and refusing the link over it would strand the user on the chat list.
 */
import { hasSession } from '../../../infra';

export function hasStoredSession(): boolean {
  return hasSession();
}
