/**
 * infra/ — LAYER: implementations of domain ports. Cannot import features/ or ui/.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export {
  queryClient,
  api,
  refreshAccessToken,
  warmBackend,
  AppError,
  isAppError,
  normalizeError,
  getAccessToken,
  getRefreshToken,
  getDeviceId,
  getAccountId,
  hasSession,
  setTokens,
  clearSession,
} from './network';
export type { AppErrorKind, SessionTokens } from './network';
export { storage, kv, KVKeys, useKVString } from './kv';
export {
  database,
  Conversation,
  Message,
  observeConversations,
  seedDevConversations,
} from './db';
export {
  ensureDeviceKey,
  signChallenge,
  hasDeviceKey,
  clearDeviceKey,
  bytesToBase64,
  base64ToBytes,
} from './crypto';
export {
  getBatteryStatus,
  getNetworkStatus,
  subscribeNetwork,
  requestNotificationPermission,
  hasNotificationPermission,
  hapticTick,
  hapticSelection,
  requestCameraPermission,
  requestMicrophonePermission,
  requestContactsPermission,
  requestBluetoothPermission,
} from './native';
export type {
  BatteryStatus,
  NetworkStatus,
  NotificationPermission,
} from './native';
