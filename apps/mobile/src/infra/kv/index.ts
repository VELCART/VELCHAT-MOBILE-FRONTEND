/**
 * infra/kv — MMKV wrapper (encrypted) (§M10).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { storage, kv, KVKeys } from './mmkv';
