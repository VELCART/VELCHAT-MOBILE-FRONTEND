/**
 * infra/db — WatermelonDB adapter, schema + models (§L5). The local DB is the UI's
 * source of truth; features observe collections, the sync engine writes them.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { database } from './database';
export { schema } from './schema';
export { observeConversations, seedDevConversations } from './queries';
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
