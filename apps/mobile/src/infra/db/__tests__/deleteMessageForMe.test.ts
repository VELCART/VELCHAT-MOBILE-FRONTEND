/**
 * Delete-for-me is a LOCAL soft delete, and it has to hold under the three things that come
 * after it (§L7).
 *
 * 1. The row must leave the chat window. `observeMessages` filters `deleted:false`, so the test
 *    reads the window through `messageWindowClauses` — the very clauses the subscription runs —
 *    rather than the observable, which does not emit under the Loki test adapter.
 * 2. The row must STAY on disk as a tombstone. A permanent destroy looks tidier right up until
 *    the next backfill re-inserts the message the user just deleted; the whole point of the
 *    `deleted` column is that reconciliation finds a row and leaves it alone.
 * 3. The chat LIST must stop advertising it. Deleting the newest message and still seeing its
 *    text as the conversation's last line is the version of this feature that users report as
 *    broken, and it is invisible from inside the thread.
 *
 * It is NOT delete-for-everyone. There is no backend route for that yet, and nothing here
 * should be read as one.
 */
import { getDatabase } from '../database';
import {
  applyServerMessages,
  deleteMessageForMe,
  messageWindowClauses,
} from '../messages';
import { purgeAllLocalChat, upsertConversation } from '../queries';
import { Message, Conversation } from '../models';
import type { ServerMessage } from '../../network/chat';

const convId = 'conv_del_1';

function serverMsg(seq: number, content: string): ServerMessage {
  return {
    messageId: `srv_${seq}`,
    conversationId: convId,
    seq,
    senderId: 'peer',
    type: 'text',
    content,
    serverTs: 1_700_000_000_000 + seq * 1000,
  };
}

/** The window the chat actually renders, read through the real query. */
async function windowBodies(): Promise<(string | undefined)[]> {
  const rows = await getDatabase()
    .get<Message>('messages')
    .query(...messageWindowClauses(convId, 50))
    .fetch();
  return rows.map(r => r.contentPlain);
}

async function rowBySeq(seq: number): Promise<Message | undefined> {
  const rows = await getDatabase().get<Message>('messages').query().fetch();
  return rows.find(r => r.seq === seq);
}

async function conversation(): Promise<Conversation> {
  return getDatabase().get<Conversation>('conversations').find(convId);
}

describe('deleteMessageForMe', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
    await upsertConversation(convId, { type: 'dm', name: 'Peer' });
    await applyServerMessages([
      serverMsg(1, 'first'),
      serverMsg(2, 'second'),
      serverMsg(3, 'third'),
    ]);
  });

  it('takes the message out of the chat window', async () => {
    const row = await rowBySeq(2);
    await deleteMessageForMe(row!.id);

    expect(await windowBodies()).toEqual(['third', 'first']);
  });

  it('keeps the row as a tombstone rather than destroying it', async () => {
    const row = await rowBySeq(2);
    await deleteMessageForMe(row!.id);

    const after = await rowBySeq(2);
    expect(after).toBeDefined();
    expect(after!.deleted).toBe(true);
  });

  it('survives the next backfill — a re-applied server frame must not resurrect it', async () => {
    const row = await rowBySeq(2);
    await deleteMessageForMe(row!.id);

    await applyServerMessages([serverMsg(2, 'second')]);

    expect((await rowBySeq(2))!.deleted).toBe(true);
    expect(await windowBodies()).toEqual(['third', 'first']);
  });

  it('moves the chat-list preview back to the newest surviving message', async () => {
    const row = await rowBySeq(3);
    await deleteMessageForMe(row!.id);

    const conv = await conversation();
    expect(conv.lastMessagePreview).toBe('second');
    expect(conv.lastMessageAt).toBe(serverMsg(2, 'second').serverTs);
  });

  it('leaves the preview alone when an OLDER message is deleted', async () => {
    const row = await rowBySeq(1);
    await deleteMessageForMe(row!.id);

    expect((await conversation()).lastMessagePreview).toBe('third');
  });

  it('empties the preview when the last surviving message goes', async () => {
    for (const seq of [1, 2, 3]) {
      const row = await rowBySeq(seq);
      await deleteMessageForMe(row!.id);
    }

    const conv = await conversation();
    expect(conv.lastMessagePreview).toBe('');
    expect(await windowBodies()).toEqual([]);
  });

  it('is a no-op on an id that is not there, and does not throw', async () => {
    await expect(deleteMessageForMe('nope')).resolves.toBeUndefined();
    expect(await windowBodies()).toEqual(['third', 'second', 'first']);
  });

  it('is idempotent — a double tap deletes once', async () => {
    const row = await rowBySeq(2);
    await deleteMessageForMe(row!.id);
    await deleteMessageForMe(row!.id);

    expect(await windowBodies()).toEqual(['third', 'first']);
    expect((await conversation()).lastMessagePreview).toBe('third');
  });
});
