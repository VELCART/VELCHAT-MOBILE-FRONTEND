/**
 * features/ — LAYER: composed feature slices. Only the feature index.ts is importable from outside.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export {};
