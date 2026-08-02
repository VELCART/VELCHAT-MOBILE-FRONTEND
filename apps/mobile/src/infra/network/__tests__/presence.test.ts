/**
 * normalizePresenceEvent — parse a live presence WS frame's `data` (a `PresenceChangedPayload`)
 * into the store shape, tolerating field-name variants and deriving last-seen from `changed_at`.
 */
import { normalizePresenceEvent } from '../presenceShape';

describe('normalizePresenceEvent', () => {
  it('reads account_id (the PresenceChangedPayload field) + status', () => {
    const ev = normalizePresenceEvent({
      account_id: 'u1',
      status: 'online',
      changed_at: '2026-08-02T10:00:00.000Z',
    });
    // online → no last-seen even though changed_at is present
    expect(ev).toEqual({ userId: 'u1', status: 'online', lastSeen: null });
  });

  it('derives last-seen from changed_at when offline', () => {
    const iso = '2026-08-02T10:00:00.000Z';
    const ev = normalizePresenceEvent({
      account_id: 'u1',
      status: 'offline',
      changed_at: iso,
    });
    expect(ev).toEqual({
      userId: 'u1',
      status: 'offline',
      lastSeen: Date.parse(iso),
    });
  });

  it('prefers an explicit lastSeen (number) over changed_at', () => {
    const ev = normalizePresenceEvent({
      userId: 'u1',
      status: 'offline',
      lastSeen: 1717236000000,
      changed_at: '2026-08-02T10:00:00.000Z',
    });
    expect(ev).toEqual({
      userId: 'u1',
      status: 'offline',
      lastSeen: 1717236000000,
    });
  });

  it('accepts user_id and defaults a missing status to offline', () => {
    const ev = normalizePresenceEvent({ user_id: 'u2' });
    expect(ev).toEqual({ userId: 'u2', status: 'offline', lastSeen: null });
  });

  it('returns null without a usable account id', () => {
    expect(normalizePresenceEvent({ status: 'online' })).toBeNull();
    expect(normalizePresenceEvent(null)).toBeNull();
    expect(normalizePresenceEvent('nope')).toBeNull();
  });
});
