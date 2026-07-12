/**
 * ui/ — screen-agnostic building blocks (Screen, EmptyState, ...).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { Placeholder } from './Placeholder';
