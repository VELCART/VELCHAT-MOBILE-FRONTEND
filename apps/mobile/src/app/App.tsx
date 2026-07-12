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
import { I18nProvider } from '../i18n';
import { FeatureFlagsProvider } from '../core';
import { queryClient, kv, KVKeys } from '../infra';
import { RootNavigator } from '../navigation';
import { ErrorBoundary } from './ErrorBoundary';
import { bootstrap } from './bootstrap';

function readInitialThemeMode(): ThemeMode {
  const saved = kv.getString(KVKeys.themeMode);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

export default function App(): React.JSX.Element {
  useEffect(() => {
    bootstrap();
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            initialMode={readInitialThemeMode()}
            onModeChange={(mode) => kv.set(KVKeys.themeMode, mode)}
          >
            <I18nProvider>
              <FeatureFlagsProvider>
                <RootNavigator />
              </FeatureFlagsProvider>
            </I18nProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
