/**
 * core/ — cross-feature: config, env, feature flags, logger, telemetry.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { appEnv } from './config/env';
export type { AppEnv, AppEnvName } from './config/env';
export { log, redact, scrubString } from './logger';
export type { LogContext } from './logger';
export {
  FeatureFlagsProvider,
  useFeatureFlag,
  useFeatureFlags,
  DEFAULT_FLAGS,
} from './feature-flags';
export type { FeatureFlags, FeatureFlagKey } from './feature-flags';
