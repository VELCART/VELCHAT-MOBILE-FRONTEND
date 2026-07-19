/**
 * Central language middleware (§M18). Binds i18next to the tree AND exposes a
 * `useLanguage()` hook so any screen can read/switch the app-wide language. The
 * chosen language is applied to i18next (every `t()` re-renders) and reported via
 * `onLanguageChange` for persistence — the i18n layer stays infra-free (§M4), so
 * the app layer injects the initial value + the MMKV write (mirrors ThemeProvider).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  i18n,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  type AppLanguage,
} from './config';

interface LanguageContextValue {
  readonly language: AppLanguage;
  readonly setLanguage: (lang: AppLanguage) => void;
  readonly supported: readonly AppLanguage[];
  readonly names: Record<AppLanguage, string>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function I18nProvider({
  children,
  initialLanguage = 'en',
  onLanguageChange,
}: {
  children: ReactNode;
  initialLanguage?: AppLanguage;
  /** Injected by the app layer to persist the choice (i18n must not import infra). */
  onLanguageChange?: (lang: AppLanguage) => void;
}): React.JSX.Element {
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);

  // Apply the persisted/initial choice to i18next once on mount.
  useEffect(() => {
    if (i18n.language !== initialLanguage) {
      void i18n.changeLanguage(initialLanguage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLanguage = useCallback(
    (lang: AppLanguage) => {
      if (!isSupportedLanguage(lang)) return;
      setLanguageState(lang);
      void i18n.changeLanguage(lang);
      onLanguageChange?.(lang);
    },
    [onLanguageChange],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      supported: SUPPORTED_LANGUAGES,
      names: LANGUAGE_NAMES,
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LanguageContext.Provider>
  );
}

/** Read + switch the app-wide language from anywhere in the tree. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within <I18nProvider>.');
  }
  return ctx;
}
