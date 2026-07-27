/**
 * Root application (§L2). Provider order:
 *   SafeAreaProvider > ErrorBoundary > QueryClientProvider > ThemeProvider >
 *   I18nProvider > FeatureFlagsProvider > NavigationContainer
 * Theme choice is persisted via encrypted MMKV (injected here; the theme layer
 * stays infra-free per §M4). WatermelonDB open + crypto init land in MP1/MP2.
 */
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, type ThemeMode } from '../theme';
import { I18nProvider, isSupportedLanguage, type AppLanguage } from '../i18n';
import { FeatureFlagsProvider, useConnectivity } from '../core';
import {
  queryClient,
  kv,
  KVKeys,
  getNetworkStatus,
  subscribeNetwork,
} from '../infra';
import { RootNavigator } from '../navigation';
import { useAuthBootstrap } from '../features/auth';
import { ErrorBoundary } from './ErrorBoundary';
import { Splash } from './Splash';
import { bootstrap } from './bootstrap';

function readInitialThemeMode(): ThemeMode {
  // Honour the Settings theme picker's saved choice; default to light (no surprise
  // system flip) until the user opts into dark/system.
  const saved = kv.getString(KVKeys.themeMode);
  return saved === 'light' || saved === 'dark' || saved === 'system'
    ? saved
    : 'light';
}

/** The app-wide language: the user's persisted choice, else English. */
function readInitialLanguage(): AppLanguage {
  const saved = kv.getString(KVKeys.language);
  return saved && isSupportedLanguage(saved) ? saved : 'en';
}

/** Splash until the launch bootstrap resolves the auth state, then the app. */
function Gate(): React.JSX.Element {
  const ready = useAuthBootstrap();
  return ready ? <RootNavigator /> : <Splash />;
}

export default function App(): React.JSX.Element {
  useEffect(() => {
    bootstrap();
    // Mirror real network reachability into the connectivity store (offline banner + gating).
    const applyOnline = (connected: boolean): void =>
      useConnectivity.getState().setOnline(connected);
    void getNetworkStatus()
      .then(s => applyOnline(s.connected))
      .catch(() => undefined);
    return subscribeNetwork(s => applyOnline(s.connected));
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            initialMode={readInitialThemeMode()}
            onModeChange={mode => kv.set(KVKeys.themeMode, mode)}
          >
            <I18nProvider
              initialLanguage={readInitialLanguage()}
              onLanguageChange={lang => kv.set(KVKeys.language, lang)}
            >
              <FeatureFlagsProvider>
                <Gate />
              </FeatureFlagsProvider>
            </I18nProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
