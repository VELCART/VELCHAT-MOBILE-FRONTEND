/**
 * features/status — feature slice. Shape: ui/ model/ api/ hooks/ db/. Only this index is public.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { UpdatesList } from './ui/UpdatesList';
export { StatusAvatar } from './ui/StatusAvatar';
export type { StatusAvatarProps } from './ui/StatusAvatar';
