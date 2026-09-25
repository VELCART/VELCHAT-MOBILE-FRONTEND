/**
 * Where a message SITS in the list after it finally sends (§L7).
 *
 * The list is ordered by `created_at`, which is stamped when the user hits send. For an online
 * send those are the same instant, so nothing looks wrong. For a message composed offline they
 * are hours apart: the bubble stays pinned at its COMPOSE time, buried under every message that
 * arrived while the phone had no signal — under a stale date separator, and, once more than a
 * window's worth arrived in between, outside the loaded window entirely. To the user who typed
 * it, their message simply vanished.
 *
 * The server timestamp is the one everyone else orders by, so on ack that is what the row must
 * carry.
 */
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '../database';
import { enqueueOptimisticSend } from '../outbox';
import {
  markMessageSent,
  applyServerMessages,
  messageWindowClauses,
} from '../messages';
import { purgeAllLocalChat, upsertConversation } from '../queries';
import { Message } from '../models';
import type { ServerMessage } from '../../network/chat';

const convId = 'conv_order_1';
const meId = 'user_me';

async function rowFor(clientMsgId: string): Promise<Message | undefined> {
  const rows = await getDatabase()
    .get<Message>('messages')
    .query(Q.where('client_msg_id', clientMsgId))
    .fetch();
  return rows[0];
}

/**
 * The window the chat actually renders, read through the REAL query clauses `observeMessages`
 * runs rather than a copy of them — a duplicated query here could stay green while the one the
 * UI runs is still wrong, which is exactly the defect these tests are about. Fetched rather
 * than observed because the window observable emits asynchronously under the Loki test adapter.
 */
function renderedWindow(): Promise<Message[]> {
  return getDatabase()
    .get<Message>('messages')
    .query(...messageWindowClauses(convId, 50))
    .fetch();
}

function peerMsg(seq: number, serverTs: number): ServerMessage {
  return {
    messageId: `srv_${seq}`,
    conversationId: convId,
    seq,
    senderId: 'peer',
    type: 'text',
    content: `m${seq}`,
    serverTs,
  };
}

describe('a send that leaves the outbox hours later', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
    await upsertConversation(convId, {
      type: 'dm',
      name: 'Peer',
      lastMessagePreview: '',
      lastMessageAt: 0,
    });
  });

  it('takes its position from the server clock, not from when it was typed', async () => {
    const clientMsgId = await enqueueOptimisticSend(convId, 'omw', meId);
    expect(clientMsgId).toBeTruthy();
    const composedAt = (await rowFor(clientMsgId as string))
      ?.createdAt as number;

    // Four hours in a tunnel, then it finally transmits.
    const serverTs = composedAt + 4 * 60 * 60 * 1000;
    await markMessageSent(clientMsgId as string, {
      messageId: 'srv1',
      seq: 900,
      serverTs,
    });

    const row = await rowFor(clientMsgId as string);
    expect(row?.seq).toBe(900);
    expect(row?.state).toBe('sent');
    // Ordered with everything else that happened at 14:00, not stranded back at 10:00.
    expect(row?.createdAt).toBe(serverTs);
  });

  it('keeps the compose time when the server did not send one', async () => {
    const clientMsgId = await enqueueOptimisticSend(convId, 'hi', meId);
    const composedAt = (await rowFor(clientMsgId as string))?.createdAt;

    await markMessageSent(clientMsgId as string, { messageId: 'srv2', seq: 5 });

    expect((await rowFor(clientMsgId as string))?.createdAt).toBe(composedAt);
  });

  it('adopts a server timestamp older than the compose time without re-burying the bubble', async () => {
    // This used to be "never drags a message backwards in time": the row kept its compose stamp
    // whenever the server's was older, to stop a slow server clock burying the bubble. That
    // rule mixed two clocks in one sort key and caused VC-030 (below). The fear behind it was
    // real, so it is asserted here directly — on POSITION, which is what the user actually sees,
    // rather than on the raw stamp.
    const clientMsgId = await enqueueOptimisticSend(convId, 'yo', meId);
    const composedAt = (await rowFor(clientMsgId as string))
      ?.createdAt as number;

    await markMessageSent(clientMsgId as string, {
      messageId: 'srv3',
      seq: 7,
      serverTs: composedAt - 60_000, // the server's clock reads earlier than ours
    });

    // The server's answer is taken as-is...
    expect((await rowFor(clientMsgId as string))?.createdAt).toBe(
      composedAt - 60_000,
    );

    // ...and the bubble still sits exactly where it belongs: after seq 6, before seq 8. Going
    // backwards on the clock cannot bury it, because `seq` decides the order.
    await applyServerMessages([
      peerMsg(6, composedAt - 120_000),
      peerMsg(8, composedAt - 30_000),
    ]);
    const rows = await renderedWindow();
    expect(rows.map(r => r.seq)).toEqual([8, 7, 6]);
  });
});

describe('VC-030 — a device clock running ahead of the server', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
    await upsertConversation(convId, { type: 'dm', name: 'Peer' });
  });

  it('does not pin an own message above everything that came after it', async () => {
    // Compose on a device whose clock leads the server. The bubble is stamped with the LOCAL
    // clock, so its stamp is minutes ahead of anything the server will hand back.
    const clientMsgId = await enqueueOptimisticSend(convId, 'mine', meId);
    const composedAt = (await rowFor(clientMsgId as string))
      ?.createdAt as number;
    const serverNow = composedAt - 10 * 60 * 1000; // the true time; the device is 10 min fast

    await markMessageSent(clientMsgId as string, {
      messageId: 'srv_mine',
      seq: 10,
      serverTs: serverNow,
    });

    // Three replies that genuinely FOLLOW it: higher seq, later on the server clock — but all
    // still earlier than our skewed local stamp.
    await applyServerMessages([
      peerMsg(11, serverNow + 1_000),
      peerMsg(12, serverNow + 2_000),
      peerMsg(13, serverNow + 3_000),
    ]);

    // Newest-first. `seq` is the ordering identity (backend-integration-reference §5: sort by
    // seq, never timestamp) — our message is the OLDEST of the four, not the newest.
    const rows = await renderedWindow();
    expect(rows.map(r => r.seq)).toEqual([13, 12, 11, 10]);
  });

  it('breaks a same-timestamp tie by seq, not by whichever row was written first', async () => {
    // The gateway fans a burst out inside one millisecond, so identical server timestamps are
    // normal. Applied out of order, `created_at` alone cannot separate them.
    const ts = Date.now();
    await applyServerMessages([
      peerMsg(22, ts),
      peerMsg(23, ts),
      peerMsg(21, ts),
    ]);

    const rows = await renderedWindow();
    expect(rows.map(r => r.seq)).toEqual([23, 22, 21]);
  });
});
