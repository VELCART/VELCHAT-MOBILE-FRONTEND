/**
 * Feature flags + remote kill-switch (§L15). Defaults are the offline-safe
 * source of truth; the server can flip them (kill-switch) at boot / on push.
 */
export const DEFAULT_FLAGS = {
  calls: true,
  groupCalls: true,
  status: true,
  communities: true,
  translation: false,
  aiSummaries: false,
} as const;

export type FeatureFlagKey = keyof typeof DEFAULT_FLAGS;
export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export interface RemoteConfigState {
  readonly flags: FeatureFlags;
  readonly maintenance: boolean;
  readonly announcement: string | null;
  /** true when the server's min_client_version is newer than this build. */
  readonly needsUpgrade: boolean;
  readonly loaded: boolean;
}

export const DEFAULT_CONFIG: RemoteConfigState = {
  flags: { ...DEFAULT_FLAGS },
  maintenance: false,
  announcement: null,
  needsUpgrade: false,
  loaded: false,
};
