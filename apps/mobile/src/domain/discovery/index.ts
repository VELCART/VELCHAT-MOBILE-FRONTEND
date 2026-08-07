/**
 * domain/discovery — OPRF private contact discovery orchestrator (§G2).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { discoverContacts, registerSelfForDiscovery } from './discoverContacts';
