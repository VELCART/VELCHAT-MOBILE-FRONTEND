/**
 * Theme (§M16) — resolves the active color scheme (light/dark/system) and
 * exposes a fully-built Theme to the design system via context.
 *
 * Persistence of the user's chosen mode arrives in a later MP0 slice (MMKV);
 * for now the default is `system` and follows the OS appearance live.
 */
import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  palette,
  pastels,
  spacing,
  radius,
  typography,
  elevation,
  motion,
  hitSlop,
  type ColorTokens,
  type ElevationSet,
} from '../design-system/tokens';

export type ColorScheme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface Theme {
  readonly scheme: ColorScheme;
  readonly colors: ColorTokens;
  readonly pastels: typeof pastels;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly typography: typeof typography;
  readonly elevation: ElevationSet;
  readonly motion: typeof motion;
  readonly hitSlop: typeof hitSlop;
}

export function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: palette[scheme],
    pastels,
    spacing,
    radius,
    typography,
    elevation: elevation[scheme],
    motion,
    hitSlop,
  };
}

interface ThemeContextValue {
  readonly theme: Theme;
  readonly mode: ThemeMode;
  readonly setMode: (mode: ThemeMode) => void;
  readonly toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialMode = 'system',
  onModeChange,
}: {
  children: ReactNode;
  initialMode?: ThemeMode;
  /** Injected by the app layer to persist the choice (theme must not import infra). */
  onModeChange?: (mode: ThemeMode) => void;
}): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const systemScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme =
      mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
    const setMode = (next: ThemeMode): void => {
      setModeState(next);
      onModeChange?.(next);
    };
    return {
      theme: buildTheme(scheme),
      mode,
      setMode,
      toggle: () => setMode(scheme === 'dark' ? 'light' : 'dark'),
    };
  }, [mode, systemScheme, onModeChange]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within <ThemeProvider>.');
  }
  return ctx;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

export function useThemeMode(): Pick<ThemeContextValue, 'mode' | 'setMode' | 'toggle'> {
  const { mode, setMode, toggle } = useThemeContext();
  return { mode, setMode, toggle };
}
