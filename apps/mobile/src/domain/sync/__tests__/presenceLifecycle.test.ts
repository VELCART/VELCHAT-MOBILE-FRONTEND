/**
 * The presence poll belongs to the open chat and must not outlive it (VC-065, §M7).
 *
 * `activatePresence` registers its `activePresencePeers` entry and starts a 20s interval AFTER
 * two awaits — a DB read, then a presence round trip — and nothing cancelled it. Closing the chat
 * inside that window produced two distinct failures:
 *
 *  - the late resume started an interval for a chat that is no longer open. Every tick is a
 *    no-op because of the guard inside it, so it is invisible — an interval that wakes the JS
 *    thread every 20s for nothing, and when push is unavailable `scheduleSuspend` returns early,
 *    so it keeps ticking all night against the §M13 background contract.
 *  - worse, when the close lands during the SHORTER await the entry is written AFTER the delete,
 *    so `activePresencePeers` keeps a ghost for a closed chat, its size can never reach 0 again,
 *    and the `clearPeerPresenceTimer()` inside `deactivatePresence` becomes dead code for the
 *    rest of the session: from then on closing ANY chat stops clearing its poll.
 *
 * Both windows are driven here with promises the test resolves by hand, so the race is
 * deterministic rather than hoped for.
 */
type MockResolver<T> = { promise: Promise<T>; resolve: (v: T) => void };
function mockDeferred<T>(): MockResolver<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

const mockPeerIdDeferred: MockResolver<string | undefined>[] = [];
const mockPresenceDeferred: MockResolver<{
  status: string;
  lastSeen: number | null;
}>[] = [];

jest.mock('../../../infra', () => {
  const actual = jest.requireActual('../../../infra') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    getAccountId: () => 'acct_me',
    peerIdFor: () => {
      const d = mockDeferred<string | undefined>();
      mockPeerIdDeferred.push(d);
      return d.promise;
    },
    getPresence: () => {
      const d = mockDeferred<{ status: string; lastSeen: number | null }>();
      mockPresenceDeferred.push(d);
      return d.promise;
    },
    subscribePresence: () => Promise.resolve(),
    getConversationMembers: () => Promise.resolve(['acct_me', 'acct_peer']),
  };
});

import { syncEngine } from '../SyncEngine';

/** Let every already-resolved microtask drain. */
const flush = (): Promise<void> =>
  new Promise(r => {
    setTimeout(r, 0);
  });

describe('a chat closed while its presence is still resolving', () => {
  beforeEach(() => {
    mockPeerIdDeferred.length = 0;
    mockPresenceDeferred.length = 0;
    jest.clearAllTimers();
  });

  afterEach(() => {
    syncEngine.deactivatePresence('conv-1');
    syncEngine.deactivatePresence('conv-2');
    syncEngine.stop();
  });

  it('leaves no interval behind when the close lands during the presence fetch', async () => {
    const spy = jest.spyOn(global, 'setInterval');
    const activating = syncEngine.activatePresence('conv-1');

    await flush();
    mockPeerIdDeferred[0]?.resolve('acct_peer'); // peer resolved → the entry is registered
    await flush();

    syncEngine.deactivatePresence('conv-1'); // user pressed back HERE
    mockPresenceDeferred[0]?.resolve({ status: 'online', lastSeen: null });
    await activating;
    await flush();

    // The poll is for a chat nobody is looking at. It must never have been started.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not tear down a NEWER activate for the same chat', async () => {
    // Open, back out, re-open — two taps. The first call's presence fetch is still in flight
    // when the second one registers and starts polling; its undo must not delete a live
    // registration, or the chat on screen is left with no poll and a frozen presence line.
    const first = syncEngine.activatePresence('conv-1');
    await flush();
    mockPeerIdDeferred[0]?.resolve('acct_peer'); // #1 registers, then awaits its fetch
    await flush();

    syncEngine.deactivatePresence('conv-1'); // back
    const second = syncEngine.activatePresence('conv-1'); // and straight back in
    await flush();
    mockPeerIdDeferred.at(-1)?.resolve('acct_peer');
    await flush();
    mockPresenceDeferred.at(-1)?.resolve({ status: 'online', lastSeen: null });
    await second;
    await flush();

    // Now #1 finally comes back, holding a stale epoch.
    const clearSpy = jest.spyOn(global, 'clearInterval');
    mockPresenceDeferred[0]?.resolve({ status: 'online', lastSeen: null });
    await first;
    await flush();
    // It owns nothing any more, so it must not stop the live poll.
    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('does not leave a ghost peer behind when the close lands during the peer lookup', async () => {
    const activating = syncEngine.activatePresence('conv-1');
    await flush();

    syncEngine.deactivatePresence('conv-1'); // user pressed back HERE, before the peer resolved
    mockPeerIdDeferred[0]?.resolve('acct_peer');
    await flush();
    // Only reached at all if the bail did not happen; resolved so the test cannot hang on it.
    mockPresenceDeferred[0]?.resolve({ status: 'online', lastSeen: null });
    await activating;
    await flush();

    // A ghost entry is what makes `deactivatePresence` stop clearing timers for the whole
    // session, so the next chat's poll would outlive it too. Prove the map is empty by opening
    // and closing a second chat and watching the interval actually get cleared.
    const setSpy = jest.spyOn(global, 'setInterval');
    const second = syncEngine.activatePresence('conv-2');
    await flush();
    mockPeerIdDeferred.at(-1)?.resolve('acct_peer2');
    await flush();
    mockPresenceDeferred.at(-1)?.resolve({ status: 'online', lastSeen: null });
    await second;
    await flush();
    expect(setSpy).toHaveBeenCalled(); // the second chat legitimately polls
    setSpy.mockRestore();

    // Spy only from here: `startPeerPresencePolling` clears before it starts, so a spy taken
    // any earlier would see that call and pass whether or not the ghost is gone.
    const clearSpy = jest.spyOn(global, 'clearInterval');
    syncEngine.deactivatePresence('conv-2');
    expect(clearSpy).toHaveBeenCalled(); // closing the only open chat stops its poll
    clearSpy.mockRestore();
  });
});
