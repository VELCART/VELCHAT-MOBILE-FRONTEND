/**
 * A read receipt must never cover a message the device does not hold (VC-069).
 *
 * Receipts are cumulative — one frame carries `upToSeq` and covers everything at or below it —
 * and every emitter derived that number from the LOCAL MAX. So a conversation with a hole in it
 * acknowledged straight over the hole: the sender got a blue tick for a message the recipient
 * never received, which is exactly how a real message loss (VC-051) stayed invisible to both
 * sides.
 *
 * `maxContiguousSeqForConversation` is the honest number to send instead: the highest seq with
 * no KNOWN hole beneath it. "Known" is doing real work in that sentence — the device holds a
 * bounded window, so history it never loaded is not a hole, and reading it as one would stall
 * the watermark and leave the sender on one grey tick forever. That failure is worse than the
 * one being fixed, so these tests pin both directions.
 */
import {
  applyServerMessages,
  maxContiguousSeqForConversation,
  maxSeqForConversation,
} from '../messages';
import { purgeAllLocalChat, upsertConversation } from '../queries';
import { getDatabase } from '../database';
import { Message } from '../models';
import type { ServerMessage } from '../../network/chat';

const convId = 'conv_contig';

function serverMsg(seq: number): ServerMessage {
  return {
    messageId: `srv_${seq}`,
    conversationId: convId,
    seq,
    senderId: 'peer',
    type: 'text',
    content: `m${seq}`,
    serverTs: 1_700_000_000_000 + seq * 1000,
  };
}

async function seed(seqs: number[]): Promise<void> {
  await applyServerMessages(seqs.map(serverMsg));
}

beforeEach(async () => {
  await purgeAllLocalChat();
  await upsertConversation(convId, { type: 'dm', name: 'Peer' });
});

describe('maxContiguousSeqForConversation', () => {
  it('is the plain max when nothing is missing', async () => {
    await seed([1, 2, 3, 4, 5]);
    expect(await maxContiguousSeqForConversation(convId)).toBe(5);
    expect(await maxSeqForConversation(convId)).toBe(5);
  });

  it('stops one below a hole instead of acknowledging across it', async () => {
    await seed([1, 2, 3, 5, 6]); // 4 was dropped by fan-out
    expect(await maxSeqForConversation(convId)).toBe(6); // what used to be sent
    expect(await maxContiguousSeqForConversation(convId)).toBe(3);
  });

  it('stops at the LOWEST hole when there is more than one', async () => {
    await seed([1, 2, 4, 5, 7]);
    expect(await maxContiguousSeqForConversation(convId)).toBe(2);
  });

  it('does NOT treat unloaded history as a hole', async () => {
    // The device holds a bounded window: a conversation that starts at seq 900 locally is the
    // normal case, not a gap. Reading it as one would pin every receipt at 0.
    await seed([900, 901, 902]);
    expect(await maxContiguousSeqForConversation(convId)).toBe(902);
  });

  it('is 0 for a conversation with nothing in it', async () => {
    expect(await maxContiguousSeqForConversation(convId)).toBe(0);
  });

  it('counts a deleted message as held — a tombstone is not a hole', async () => {
    await seed([1, 2, 3]);
    const db = getDatabase();
    const rows = await db.get<Message>('messages').query().fetch();
    const two = rows.find(r => r.seq === 2);
    await db.write(async () => {
      await two?.update(m => {
        m.deleted = true;
      });
    });
    // The user saw it and then it was deleted. The seq is still accounted for, so the watermark
    // must not stall behind a tombstone.
    expect(await maxContiguousSeqForConversation(convId)).toBe(3);
  });
});
