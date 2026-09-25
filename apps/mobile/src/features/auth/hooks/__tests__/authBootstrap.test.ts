/**
 * Cold start must not wait on the network (§M0 rule 2: "the UI never waits on the network on
 * the render path").
 *
 * `App.tsx` renders `<Splash/>` until this hook reports ready, so anything this hook awaits is
 * time the user spends staring at a splash screen. It used to await a token refresh whenever
 * the stored access token had expired — which is every launch more than 15 minutes after the
 * last one, since access tokens live 15 minutes. Against a hibernating free-tier backend that
 * refresh alone takes 40-60s (client.ts measured 44s), and if it timed out the hook then tried
 * two MORE network calls before giving up. That is the multi-minute splash.
 */
const mockRefreshAccessToken = jest.fn();
const mockRequestChallenge = jest.fn();
const mockLoginWithDeviceKey = jest.fn();
const mockState = {
  hasSession: true,
  hasValidSession: false,
  refreshToken: 'opaque-refresh' as string | undefined,
  deviceKey: true,
  deviceId: 'dev-1' as string | undefined,
};

// `jest.mock` is hoisted above the consts above, and the auth store calls `hasSession()` at
// module-init time (zustand builds its initial state eagerly) — which happens while
// `mockState` is still undefined. Hence the optional chaining and defaults.
jest.mock('../../../../infra', () => {
  const actual = jest.requireActual('../../../../infra');
  return {
    ...actual,
    hasSession: () => mockState?.hasSession ?? true,
    hasValidSession: () => mockState?.hasValidSession ?? false,
    getRefreshToken: () => mockState?.refreshToken,
    hasDeviceKey: () => mockState?.deviceKey ?? true,
    getDeviceId: () => mockState?.deviceId,
    signChallenge: () => 'signature',
    refreshAccessToken: (...args: unknown[]) =>
      mockRefreshAccessToken(...args) as unknown,
  };
});
// Same hoisting caveat as above: reference the spies lazily, or the factory captures
// `undefined` and every call throws — which would make these tests pass for the wrong reason.
jest.mock('../../api/authApi', () => ({
  requestChallenge: (...args: unknown[]) =>
    mockRequestChallenge(...args) as unknown,
  loginWithDeviceKey: (...args: unknown[]) =>
    mockLoginWithDeviceKey(...args) as unknown,
}));
jest.mock('../../../notifications', () => ({
  shutdownPushForSignOut: jest.fn(() => Promise.resolve()),
  startPushRuntime: jest.fn(),
}));
jest.mock('../../../user', () => ({
  clearProfileCache: jest.fn(),
  clearContactAvatarCache: jest.fn(),
}));
jest.mock('../../../contacts', () => ({
  clearContactsDiscoveryCache: jest.fn(),
}));
jest.mock('../../../chat', () => ({
  clearConversationPeerCache: jest.fn(),
  clearStartDmCache: jest.fn(),
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import { useAuthBootstrap } from '../useAuth';

/** A promise that never settles — stands in for a hibernating backend. */
const neverResolves = (): Promise<never> => new Promise(() => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockState.hasSession = true;
  mockState.hasValidSession = false;
  mockState.refreshToken = 'opaque-refresh';
  mockState.deviceKey = true;
  mockState.deviceId = 'dev-1';
  mockRefreshAccessToken.mockResolvedValue('fresh-access');
  mockRequestChallenge.mockResolvedValue({ nonce: 'n' });
  mockLoginWithDeviceKey.mockResolvedValue({
    accountId: 'a',
    deviceId: 'd',
    access: 'x',
    refresh: 'y',
    expiresIn: 900,
  });
});

describe('cold start with a session already on the device', () => {
  it('the exact defect: an EXPIRED access token must not hold the splash on a refresh', async () => {
    // The backend is asleep — the refresh will never come back.
    mockRefreshAccessToken.mockImplementation(neverResolves);

    const { result } = renderHook(() => useAuthBootstrap());

    // Ready on the first pass, with the network still in flight.
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('still refreshes, just not in front of the user', async () => {
    mockRefreshAccessToken.mockImplementation(neverResolves);

    renderHook(() => useAuthBootstrap());

    // The socket wants a fresh token as soon as possible (VC-036) — the work still happens,
    // it simply no longer gates the UI.
    await waitFor(() => expect(mockRefreshAccessToken).toHaveBeenCalled());
  });

  it('does not spend a refresh when the stored token is still valid', async () => {
    mockState.hasValidSession = true;

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });
});

describe('cold start with no session', () => {
  it('shows onboarding immediately when there is nothing to restore from', async () => {
    mockState.hasSession = false;
    mockState.refreshToken = undefined;
    mockState.deviceKey = false;
    mockState.deviceId = undefined;

    const { result } = renderHook(() => useAuthBootstrap());

    await waitFor(() => expect(result.current).toBe(true));
    expect(mockRequestChallenge).not.toHaveBeenCalled();
  });

  it('never holds the splash indefinitely on a silent device-key restore', async () => {
    // Signed out locally but the device key survives, so a silent re-login is worth attempting
    // — but not at the cost of an unbounded splash if the backend is hibernating.
    mockState.hasSession = false;
    mockState.refreshToken = undefined;
    mockRequestChallenge.mockImplementation(neverResolves);

    const { result } = renderHook(() => useAuthBootstrap());

    // Prove we actually took the device-key path before asserting it did not hang.
    await waitFor(() => expect(mockRequestChallenge).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBe(true), { timeout: 9000 });
  }, 12000);
});
