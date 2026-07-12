/**
 * platform/ — OS abstractions (iOS/Android) behind typed TS interfaces (§M2).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export {};
