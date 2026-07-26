/**
 * features/user — feature slice. Shape: ui/ api/ hooks/. Only this index is public.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { ProfileSetupSheet } from './ui/ProfileSetupSheet';
export { useProfileGate, useProfileSummary } from './hooks/useProfile';
export type { Profile } from './api/userApi';
