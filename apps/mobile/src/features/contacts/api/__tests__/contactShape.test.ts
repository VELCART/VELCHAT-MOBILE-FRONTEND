/**
 * The user-service returns contacts as snake_case rows (`contact_user_id`, `display_name`,
 * `blocked`); the response envelope does not camelCase them. These tests lock in that
 * `normalizeContacts` maps them defensively — so the peer id + name resolve — drops rows
 * without a usable id, and never throws on a shape drift. Pure module (no infra).
 */
import { normalizeContact, normalizeContacts } from '../contactShape';

describe('normalizeContact', () => {
  test('maps a snake_case backend row to a camelCase Contact', () => {
    expect(
      normalizeContact({
        contact_user_id: 'acc_1',
        display_name: 'Aarav',
        blocked: false,
      }),
    ).toEqual({
      contactUserId: 'acc_1',
      displayName: 'Aarav',
      blocked: false,
    });
  });

  test('null display_name → null (never undefined); blocked defaults to false', () => {
    expect(normalizeContact({ contact_user_id: 'acc_2' })).toEqual({
      contactUserId: 'acc_2',
      displayName: null,
      blocked: false,
    });
  });

  test('accepts an already-camelCase row + stringified blocked', () => {
    expect(
      normalizeContact({ contactUserId: 'acc_3', blocked: 'true' }),
    ).toEqual({ contactUserId: 'acc_3', displayName: null, blocked: true });
  });

  test('a row without any usable id → null (dropped)', () => {
    expect(normalizeContact({ display_name: 'No Id' })).toBeNull();
    expect(normalizeContact(null)).toBeNull();
  });
});

describe('normalizeContacts', () => {
  test('normalises an array and drops unusable rows', () => {
    const rows = [
      { contact_user_id: 'acc_1', display_name: 'Aarav', blocked: false },
      { display_name: 'Ghost' }, // no id → dropped
      { contact_user_id: 'acc_2', blocked: true },
    ];
    expect(normalizeContacts(rows)).toEqual([
      { contactUserId: 'acc_1', displayName: 'Aarav', blocked: false },
      { contactUserId: 'acc_2', displayName: null, blocked: true },
    ]);
  });

  test('non-array input → empty array, never throw', () => {
    expect(normalizeContacts(null)).toEqual([]);
    expect(normalizeContacts({})).toEqual([]);
  });
});
