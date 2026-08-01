/**
 * The user-service returns profile reads as snake_case DB rows (the response envelope
 * does not camelCase). These tests lock in that `normalizeProfile` maps them to our
 * camelCase `Profile`, so the avatar (avatar_media_id) and name actually resolve.
 */
import { normalizeProfile } from '../profileShape';

test('maps snake_case backend row to camelCase Profile', () => {
  const row = {
    user_id: 'acc_1',
    display_name: 'Aayush',
    avatar_media_id: 'med_abc',
    about: 'Building VelChat',
    presence_privacy: 'contacts',
    lastseen_privacy: 'nobody',
    readreceipts_enabled: false,
  };
  expect(normalizeProfile(row)).toEqual({
    displayName: 'Aayush',
    about: 'Building VelChat',
    avatarMediaId: 'med_abc',
    presencePrivacy: 'contacts',
    lastseenPrivacy: 'nobody',
    readreceiptsEnabled: false,
  });
});

test('also accepts an already-camelCase row (defensive)', () => {
  const row = { displayName: 'Aayush', avatarMediaId: 'med_abc' };
  const p = normalizeProfile(row);
  expect(p.displayName).toBe('Aayush');
  expect(p.avatarMediaId).toBe('med_abc');
});

test('missing fields become undefined, never throw', () => {
  expect(normalizeProfile(null)).toEqual({
    displayName: undefined,
    about: undefined,
    avatarMediaId: undefined,
    presencePrivacy: undefined,
    lastseenPrivacy: undefined,
    readreceiptsEnabled: undefined,
  });
});
