/**
 * Quoted reply, write path + read path (§L6/§L7).
 *
 * A reply is not a decoration on a send — it is part of the SAME fact. The quoted target has to
 * land on the optimistic bubble and in the durable outbox payload inside the one transaction that
 * writes them, or the two halves can disagree: a bubble that renders as a reply while the row the
 * worker transmits (and re-transmits, on every retry, under the same clientMsgId) carries no
 * `replyTo` — so the peer receives a plain message and nothing ever reconciles the difference.
 *
 * The other half is the read: rendering a quoted preview one bubble at a time would put N point
 * lookups on the render path of a scroll. `findQuotedMessages` is the batched alternative.
 */
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '../database';
import { enqueueOptimisticSend } from '../outbox';
import {
  findQuotedMessages,
  applyServerMessages,
  markMessageSent,
} from '../messages';
import { syntheticMessageId } from '../../network/chat';
import type { ServerMessage } from '../../network/chat';
import { purgeAllLocalChat, upsertConversation } from '../queries';
import { Message, Outbox } from '../models';
import type { SendMessageInput } from '../../network/chat';

const convId = 'conv_reply_1';
const meId = 'user_me';

async function rowFor(clientMsgId: string): Promise<Message | undefined> {
  const rows = await getDatabase()
    .get<Message>('messages')
    .query(Q.where('client_msg_id', clientMsgId))
    .fetch();
  return rows[0];
}

async function payloadFor(
  clientMsgId: string,
): Promise<SendMessageInput | undefined> {
  const rows = await getDatabase().get<Outbox>('outbox').query().fetch();
  for (const o of rows) {
    const parsed = JSON.parse(o.payload) as SendMessageInput;
    if (parsed.clientMsgId === clientMsgId) return parsed;
  }
  return undefined;
}

/** Seed a bare message row and hand back the record id the UI would quote by. */
async function seedMessage(body: string): Promise<string> {
  const db = getDatabase();
  let id = '';
  await db.write(async () => {
    const row = await db.get<Message>('messages').create(m => {
      m.clientMsgId = `seed_${body}`;
      m.conversationId = convId;
      m.senderId = 'peer';
      m.type = 'text';
      m.contentPlain = body;
      m.state = 'sent';
      m.deleted = false;
      m.viewOnce = false;
      m.starred = false;
      m.createdAt = Date.now();
    });
    id = row.id;
  });
  return id;
}

describe('enqueueOptimisticSend with a quoted reply', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
    await upsertConversation(convId, {
      type: 'dm',
      name: 'Peer',
      lastMessagePreview: '',
      lastMessageAt: 0,
    });
  });

  it('stamps the quoted id on the bubble AND on the payload the worker retries', async () => {
    const quoted = await seedMessage('the original');

    const clientMsgId = await enqueueOptimisticSend(
      convId,
      'answering that',
      meId,
      quoted,
    );

    expect(clientMsgId).toBeTruthy();
    expect((await rowFor(clientMsgId!))?.replyToId).toBe(quoted);
    // The payload is what every retry transmits — the reply must survive them all, not just
    // the first attempt, because the send is idempotent by clientMsgId and never re-built.
    expect((await payloadFor(clientMsgId!))?.replyTo).toBe(quoted);
  });

  it('leaves both sides unwritten for an ordinary send — never an empty string, never a key on the wire', async () => {
    const clientMsgId = await enqueueOptimisticSend(
      convId,
      'just talking',
      meId,
    );

    expect(clientMsgId).toBeTruthy();
    // `null`, not `undefined`, is the floor for the ROW: WatermelonDB's sanitizer stamps every
    // unwritten optional string column `null` (`raw[key] = isOptional ? null : ''`), so no write
    // path can leave one `undefined`. What the write path CAN get wrong is writing `''` — a
    // bubble whose `reply_to_id` is the empty string renders as a reply to nothing — so that is
    // what this pins: nothing was written at all.
    const stored = (await rowFor(clientMsgId!))?.replyToId;
    expect(stored ?? null).toBeNull();
    expect(stored).not.toBe('');

    const payload = await payloadFor(clientMsgId!);
    expect(payload).toBeDefined();
    // The PAYLOAD has no such floor and must be genuinely absent: under
    // `exactOptionalPropertyTypes` an explicit `undefined` is still a property, and it
    // serialises to `null` on the wire — which the backend reads as "cleared", not "absent".
    expect('replyTo' in payload!).toBe(false);
  });

  it('still writes the bubble and its outbox row in ONE transaction', async () => {
    const quoted = await seedMessage('doomed target');
    const db = getDatabase();
    const write = jest
      .spyOn(db, 'write')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(
      enqueueOptimisticSend(convId, 'reply that dies', meId, quoted),
    ).rejects.toThrow('disk full');
    write.mockRestore();

    // Only the seeded target survives: no half-written reply, no orphan outbox row.
    const msgs = await db
      .get<Message>('messages')
      .query(Q.where('conversation_id', convId))
      .fetch();
    expect(msgs).toHaveLength(1);
    expect(await db.get<Outbox>('outbox').query().fetchCount()).toBe(0);
  });
});

describe('server_msg_id — the identity a quote is resolved by', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
    await upsertConversation(convId, {
      type: 'dm',
      name: 'Peer',
      lastMessagePreview: '',
      lastMessageAt: 0,
    });
  });

  function inbound(
    seq: number,
    over: Partial<ServerMessage> = {},
  ): ServerMessage {
    return {
      messageId: `mongo_oid_${seq}`,
      conversationId: convId,
      seq,
      senderId: 'peer',
      type: 'text',
      content: `body ${seq}`,
      serverTs: 1_700_000_000_000 + seq,
      ...over,
    };
  }

  async function bySeq(seq: number): Promise<Message | undefined> {
    const rows = await getDatabase()
      .get<Message>('messages')
      .query(Q.where('conversation_id', convId), Q.where('seq', seq))
      .fetch();
    return rows[0];
  }

  it('is stored when a message arrives from the server (insert branch)', async () => {
    await applyServerMessages([inbound(1)]);
    expect((await bySeq(1))?.serverMsgId).toBe('mongo_oid_1');
  });

  it('is learned by a locally-composed row when its own echo reconciles (update branch)', async () => {
    const clientMsgId = await enqueueOptimisticSend(convId, 'mine', meId);
    // The echo of our own send: matched by client_msg_id, so this takes the update branch.
    await applyServerMessages([
      inbound(7, {
        senderId: meId,
        clientMsgId: clientMsgId!,
        content: 'mine',
      }),
    ]);
    expect((await rowFor(clientMsgId!))?.serverMsgId).toBe('mongo_oid_7');
  });

  it('is learned at the ACK, which is where our own row usually hears it first', async () => {
    const clientMsgId = await enqueueOptimisticSend(convId, 'mine', meId);
    await markMessageSent(clientMsgId!, { messageId: 'mongo_oid_9', seq: 9 });
    expect((await rowFor(clientMsgId!))?.serverMsgId).toBe('mongo_oid_9');
  });

  it('is never clobbered by an ack that carries no id', async () => {
    const clientMsgId = await enqueueOptimisticSend(convId, 'mine', meId);
    await markMessageSent(clientMsgId!, { messageId: 'mongo_oid_3', seq: 3 });
    // `normalizeSendAck` defaults a missing id to '' — that must not erase what we know.
    await markMessageSent(clientMsgId!, { messageId: '', seq: 3 });
    expect((await rowFor(clientMsgId!))?.serverMsgId).toBe('mongo_oid_3');
  });

  it('refuses the SYNTHESISED id, which is not a server identity at all', async () => {
    // `normalizeServerMessage` invents `srv_<conv>_<seq>` when a frame omits the id. Storing it
    // would be worse than storing nothing: the transmit-time swap would then hand the backend a
    // `replyTo` it cannot resolve — the exact defect this column exists to remove.
    const seq = 4;
    await applyServerMessages([
      inbound(seq, { messageId: syntheticMessageId(convId, seq) }),
    ]);
    const stored = (await bySeq(seq))?.serverMsgId;
    expect(stored ?? null).toBeNull();
  });
});

describe('findQuotedMessages', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
    await upsertConversation(convId, {
      type: 'dm',
      name: 'Peer',
      lastMessagePreview: '',
      lastMessageAt: 0,
    });
  });

  it('matches a quote that names the LOCAL record id', async () => {
    // What the composer has for a message the user just sent, before any ack.
    const a = await seedMessage('alpha');
    const rows = await findQuotedMessages([a]);
    expect(rows.map(r => r.id)).toEqual([a]);
  });

  it('matches a quote that names the SERVER id — the inbound case that was broken', async () => {
    await applyServerMessages([
      {
        messageId: 'mongo_oid_42',
        conversationId: convId,
        seq: 42,
        senderId: 'peer',
        type: 'text',
        content: 'quoted by the peer',
        serverTs: 1_700_000_000_042,
      },
    ]);
    const rows = await findQuotedMessages(['mongo_oid_42']);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentPlain).toBe('quoted by the peer');
  });

  it('serves a window that mixes both kinds of id in ONE query', async () => {
    const local = await seedMessage('mine, unacked');
    await applyServerMessages([
      {
        messageId: 'mongo_oid_43',
        conversationId: convId,
        seq: 43,
        senderId: 'peer',
        type: 'text',
        content: 'theirs',
        serverTs: 1_700_000_000_043,
      },
    ]);
    const rows = await findQuotedMessages([local, 'mongo_oid_43', 'gone']);
    expect(rows.map(r => r.contentPlain).sort()).toEqual([
      'mine, unacked',
      'theirs',
    ]);
  });

  it('simply omits an id that matches nothing, rather than throwing', async () => {
    const a = await seedMessage('alpha');
    const rows = await findQuotedMessages([a, 'never_existed']);
    expect(rows.map(r => r.id)).toEqual([a]);
  });

  it('answers an empty input without touching the database at all', async () => {
    const db = getDatabase();
    const get = jest.spyOn(db, 'get');
    await expect(findQuotedMessages([])).resolves.toEqual([]);
    expect(get).not.toHaveBeenCalled();
    get.mockRestore();
  });
});
