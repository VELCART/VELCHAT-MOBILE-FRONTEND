/**
 * infra/network — Axios client + interceptors (§M7/§L3).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { queryClient } from './queryClient';
export { api } from './client';
export { AppError, isAppError, normalizeError } from './errors';
export type { AppErrorKind } from './errors';
export {
  getAccessToken,
  getRefreshToken,
  hasSession,
  setTokens,
  clearSession,
} from './tokens';
export type { SessionTokens } from './tokens';
