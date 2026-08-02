/**
 * Live realtime store — typing expiry logic + presence normalisation + Map-immutability
 * (a write must replace the Map so zustand selectors re-run). Pure JS, no RN.
 */
import {
  isTypingActive,
  normalizePresenceStatus,
  useRealtimeStore,
  TYPING_TTL_MS,
  type TypingEntry,
} from '../realtimeStore';

describe('isTypingActive', () => {
  const now = 1_000_000;
  it('is false for a missing entry', () => {
    expect(isTypingActive(undefined, now)).toBe(false);
  });
  it('is true while unexpired and false once expired', () => {
    const live: TypingEntry = { userId: 'u1', expiresAt: now + 1 };
    const dead: TypingEntry = { userId: 'u1', expiresAt: now };
    expect(isTypingActive(live, now)).toBe(true);
    // expiresAt must be strictly greater than now
    expect(isTypingActive(dead, now)).toBe(false);
    expect(isTypingActive({ userId: 'u1', expiresAt: now - 1 }, now)).toBe(
      false,
    );
  });
  it('honours the TTL window', () => {
    const entry: TypingEntry = { userId: 'u1', expiresAt: now + TYPING_TTL_MS };
    expect(isTypingActive(entry, now + TYPING_TTL_MS - 1)).toBe(true);
    expect(isTypingActive(entry, now + TYPING_TTL_MS)).toBe(false);
  });
});

describe('normalizePresenceStatus', () => {
  it('passes through known availabilities incl. the WS coarse "online"', () => {
    for (const s of ['available', 'away', 'offline', 'incall', 'online']) {
      expect(normalizePresenceStatus(s)).toBe(s);
    }
  });
  it('fails closed to offline for anything unknown', () => {
    expect(normalizePresenceStatus('bogus')).toBe('offline');
    expect(normalizePresenceStatus('')).toBe('offline');
  });
});

describe('useRealtimeStore writers', () => {
  beforeEach(() => useRealtimeStore.getState().reset());

  it('setTyping replaces the Map (new ref) and stores the entry', () => {
    const before = useRealtimeStore.getState().typingByConversation;
    useRealtimeStore.getState().setTyping('c1', 'u1', 5000);
    const after = useRealtimeStore.getState().typingByConversation;
    expect(after).not.toBe(before); // immutable replace → selectors re-run
    expect(after.get('c1')).toEqual({ userId: 'u1', expiresAt: 5000 });
  });

  it('clearTyping removes only that conversation and is a no-op when absent', () => {
    const s = useRealtimeStore.getState();
    s.setTyping('c1', 'u1', 5000);
    s.setTyping('c2', 'u2', 6000);
    const ref = useRealtimeStore.getState().typingByConversation;
    // no-op path returns the SAME state ref
    useRealtimeStore.getState().clearTyping('missing');
    expect(useRealtimeStore.getState().typingByConversation).toBe(ref);
    useRealtimeStore.getState().clearTyping('c1');
    const after = useRealtimeStore.getState().typingByConversation;
    expect(after.has('c1')).toBe(false);
    expect(after.get('c2')).toEqual({ userId: 'u2', expiresAt: 6000 });
  });

  it('resetTyping drops typing but keeps presence', () => {
    const s = useRealtimeStore.getState();
    s.setTyping('c1', 'u1', 5000);
    s.setPresence('u9', { status: 'online', lastSeen: null });
    useRealtimeStore.getState().resetTyping();
    expect(useRealtimeStore.getState().typingByConversation.size).toBe(0);
    expect(useRealtimeStore.getState().presenceByUser.get('u9')).toEqual({
      status: 'online',
      lastSeen: null,
    });
  });

  it('setPresence replaces the Map and reset clears everything', () => {
    const before = useRealtimeStore.getState().presenceByUser;
    useRealtimeStore.getState().setPresence('u1', {
      status: 'offline',
      lastSeen: 123,
    });
    expect(useRealtimeStore.getState().presenceByUser).not.toBe(before);
    useRealtimeStore.getState().reset();
    expect(useRealtimeStore.getState().presenceByUser.size).toBe(0);
    expect(useRealtimeStore.getState().typingByConversation.size).toBe(0);
  });
});
