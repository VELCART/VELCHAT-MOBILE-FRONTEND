/**
 * infra/ — LAYER: implementations of domain ports. Cannot import features/ or ui/.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export {
  queryClient,
  api,
  AppError,
  isAppError,
  normalizeError,
  getAccessToken,
  getRefreshToken,
  hasSession,
  setTokens,
  clearSession,
} from './network';
export type { AppErrorKind, SessionTokens } from './network';
export { storage, kv, KVKeys } from './kv';
export {
  ensureDeviceKey,
  signChallenge,
  hasDeviceKey,
  clearDeviceKey,
  bytesToBase64,
  base64ToBytes,
} from './crypto';
export { getBatteryStatus, getNetworkStatus, subscribeNetwork } from './native';
export type { BatteryStatus, NetworkStatus } from './native';
