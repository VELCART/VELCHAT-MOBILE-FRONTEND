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
  sendChatMessage,
  fetchMessagesAfter,
  normalizeSendAck,
  normalizeServerMessage,
  createDm,
  getConversationDetails,
  getConversationMembers,
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
export type {
  AppErrorKind,
  SessionTokens,
  SendMessageInput,
  SendAck,
  ServerMessage,
  CreateDmResult,
  ConversationDetails,
  ConversationType,
} from './network';
export { storage, kv, KVKeys, useKVString } from './kv';
export {
  Conversation,
  Message,
  observeConversations,
  seedDevConversations,
  listConversationIds,
  clearUnread,
  upsertConversation,
  observeMessages,
  sendMessageLocal,
  seedDevMessages,
  applyServerMessage,
  applyServerMessages,
  markMessageSent,
  markMessageFailed,
  markMessageSending,
  maxSeqForConversation,
  applyReceipt,
  enqueueSend,
  claimNextDue,
  markAckd,
  markFailed,
  recoverStuckSends,
  requeueFailed,
  outboxStats,
  reconcileDecision,
  backoffMs,
  nextOutboxRetry,
  MAX_SEND_ATTEMPTS,
} from './db';
export type {
  OutboxItem,
  OutboxStats,
  ReconcileAction,
  BackoffOptions,
  ConversationPatch,
} from './db';
export { RealtimeSocket, WS_CODE_DEAD, WS_CODE_UNAUTHORIZED } from './realtime';
export type { RealtimeSocketCallbacks } from './realtime';
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
