/**
 * The group-channel-service returns conversation reads as snake_case DB rows (the response
 * envelope does not camelCase). These tests lock in that the conversation normalisers map
 * them defensively so ids/types/names actually resolve — never silently `undefined` — and
 * never throw on a shape drift. Pure module (no DB / RN), so it runs in a plain unit test.
 */
import {
  normalizeCreateDm,
  normalizeConversationDetails,
  normalizeMembers,
} from '../conversationShape';

describe('normalizeCreateDm', () => {
  test('camelCase response (conversationId + created)', () => {
    expect(
      normalizeCreateDm({ conversationId: 'dm-abc', created: true }),
    ).toEqual({ conversationId: 'dm-abc', created: true });
  });

  test('snake_case response (conversation_id) + existing DM (created:false)', () => {
    expect(
      normalizeCreateDm({ conversation_id: 'dm-abc', created: false }),
    ).toEqual({ conversationId: 'dm-abc', created: false });
  });

  test('stringified boolean is coerced', () => {
    expect(
      normalizeCreateDm({ conversationId: 'dm-x', created: 'true' }),
    ).toEqual({ conversationId: 'dm-x', created: true });
  });

  test('missing fields → empty id + created:false, never throw', () => {
    expect(normalizeCreateDm(null)).toEqual({
      conversationId: '',
      created: false,
    });
    expect(normalizeCreateDm({})).toEqual({
      conversationId: '',
      created: false,
    });
  });
});

describe('normalizeConversationDetails', () => {
  test('maps a snake_case DM row to camelCase', () => {
    const row = {
      conversation_id: 'dm-abc',
      type: 'dm',
      tenant_id: 'tnt_1',
      name: 'Aarav',
      avatar_media_id: 'med_1',
      created_by: 'acc_me',
    };
    expect(normalizeConversationDetails(row)).toEqual({
      conversationId: 'dm-abc',
      type: 'dm',
      name: 'Aarav',
      avatarMediaId: 'med_1',
      createdBy: 'acc_me',
      tenantId: 'tnt_1',
    });
  });

  test('unknown/missing type defaults to dm; optional fields omitted when absent', () => {
    expect(normalizeConversationDetails({ conversation_id: 'c1' })).toEqual({
      conversationId: 'c1',
      type: 'dm',
    });
    expect(
      normalizeConversationDetails({ conversation_id: 'c2', type: 'weird' })
        .type,
    ).toBe('dm');
  });

  test('preserves group / channel types', () => {
    expect(
      normalizeConversationDetails({ conversation_id: 'g1', type: 'group' })
        .type,
    ).toBe('group');
    expect(
      normalizeConversationDetails({ conversation_id: 'ch1', type: 'channel' })
        .type,
    ).toBe('channel');
  });

  test('null input → empty id + dm, never throw', () => {
    expect(normalizeConversationDetails(null)).toEqual({
      conversationId: '',
      type: 'dm',
    });
  });
});

describe('normalizeMembers', () => {
  test('bare string[] of account_ids passes through, dropping blanks', () => {
    expect(normalizeMembers(['acc_a', 'acc_b', ''])).toEqual([
      'acc_a',
      'acc_b',
    ]);
  });

  test('defensively reads object rows ({account_id}/{user_id})', () => {
    expect(
      normalizeMembers([{ account_id: 'acc_a' }, { user_id: 'acc_b' }]),
    ).toEqual(['acc_a', 'acc_b']);
  });

  test('non-array input → empty array, never throw', () => {
    expect(normalizeMembers(null)).toEqual([]);
    expect(normalizeMembers({})).toEqual([]);
  });
});
