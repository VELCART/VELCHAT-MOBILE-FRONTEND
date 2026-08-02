/**
 * infra/db — WatermelonDB adapter, schema + models (§L5). The local DB is the UI's
 * source of truth; features observe collections, the sync engine writes them.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { schema } from './schema';
export {
  observeConversations,
  seedDevConversations,
  listConversationIds,
} from './queries';
export {
  observeMessages,
  sendMessageLocal,
  seedDevMessages,
  applyServerMessage,
  applyServerMessages,
  markMessageSent,
  markMessageFailed,
  maxSeqForConversation,
  applyReceipt,
} from './messages';
export {
  enqueueSend,
  claimNextDue,
  markAckd,
  markFailed,
  recoverStuckSends,
  outboxStats,
} from './outbox';
export type { OutboxItem, OutboxStats } from './outbox';
export {
  reconcileDecision,
  backoffMs,
  nextOutboxRetry,
  MAX_SEND_ATTEMPTS,
} from './syncLogic';
export type { ReconcileAction, BackoffOptions } from './syncLogic';
export {
  Conversation,
  Message,
  Receipt,
  ConversationMember,
  User,
  Outbox,
  Draft,
  UploadJob,
  DownloadJob,
} from './models';
