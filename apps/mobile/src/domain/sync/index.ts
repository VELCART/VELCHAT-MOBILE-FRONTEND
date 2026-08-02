/**
 * domain/sync — SyncEngine, cursors, outbox (§L6).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { syncEngine, startSync, stopSync } from './SyncEngine';
