/**
 * Inbox restore (§M0/§L6) — re-discover this account's conversations from the server after a
 * fresh install, re-login, or a logout wipe, so the chat list isn't empty. The backend inbox
 * (`GET /users/:id/conversations`) lists the conversations + members; for each we name a DM by
 * the OTHER member's profile (DMs store no name), upsert the local row, then pull its recent
 * message window so it shows with its last message (an empty conversation stays hidden — the
 * list filters on last_message_at).
 *
 * Best-effort + idempotent: any per-conversation failure is skipped; never throws. Runs off the
 * render path. feature/chat/api — may reach infra + the user directory (feature→feature).
 */
import {
  fetchInbox,
  upsertConversation,
  getAccountId,
  fetchMessagesAfter,
  applyServerMessages,
  type InboxConversation,
} from '../../../infra';
import { getProfile } from '../../user';

export async function backfillInbox(): Promise<void> {
  const me = getAccountId();
  if (!me) return;

  let rows: InboxConversation[];
  try {
    rows = await fetchInbox(me);
  } catch {
    return; // offline / backend down — the local DB (if any) still renders
  }

  for (const c of rows) {
    // Name resolution: a group carries its name; a DM is named by the other member.
    let name: string | undefined = c.name ?? undefined;
    if (!name && c.type === 'dm') {
      const peer = c.memberIds.find(id => id !== me);
      if (peer) {
        try {
          const p = await getProfile(peer);
          if (p.displayName && p.displayName.trim())
            name = p.displayName.trim();
        } catch {
          // leave unnamed; a later resolution can refine it
        }
      }
    }
    await upsertConversation(
      c.conversationId,
      name ? { type: c.type, name } : { type: c.type },
    );

    // Pull the recent message window so the chat surfaces with its last message + preview.
    try {
      const msgs = await fetchMessagesAfter(c.conversationId, 0);
      if (msgs.length > 0) await applyServerMessages(msgs);
    } catch {
      // best-effort: the conversation still exists; messages sync later on reconnect
    }
  }
}
