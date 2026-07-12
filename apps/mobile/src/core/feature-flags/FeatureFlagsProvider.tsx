/**
 * Provides remote config to the tree (§L15). Renders immediately with defaults
 * (never blocks), then fetches in the background and updates. Kill-switch: a
 * flag flipped off server-side disables that feature on next load / push.
 */
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadRemoteConfig } from './loader';
import { DEFAULT_CONFIG, DEFAULT_FLAGS, type FeatureFlagKey, type FeatureFlags, type RemoteConfigState } from './types';

const FeatureFlagsContext = createContext<RemoteConfigState>({
  ...DEFAULT_CONFIG,
  flags: { ...DEFAULT_FLAGS },
});

export function FeatureFlagsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<RemoteConfigState>({ ...DEFAULT_CONFIG, flags: { ...DEFAULT_FLAGS } });

  useEffect(() => {
    let active = true;
    loadRemoteConfig()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext).flags;
}

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return useContext(FeatureFlagsContext).flags[key];
}

export function useRemoteConfig(): RemoteConfigState {
  return useContext(FeatureFlagsContext);
}
