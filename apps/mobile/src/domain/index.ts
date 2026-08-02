/**
 * domain/ — LAYER: pure TS, no RN/infra imports.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { discoverContacts } from './discovery';
