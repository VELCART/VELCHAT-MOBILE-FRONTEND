/**
 * i18n runtime (§M18). i18next + react-i18next; ICU-style interpolation.
 * en + ar (RTL) to start; runtime language switch. Full RTL layout audit is MP9.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const RTL_LANGUAGES: readonly AppLanguage[] = ['ar'];

export function isRTLLanguage(lang: string): boolean {
  return (RTL_LANGUAGES as readonly string[]).includes(lang);
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
    compatibilityJSON: 'v4',
  })
  .catch(() => undefined);

export async function setAppLanguage(lang: AppLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  // NOTE: I18nManager.forceRTL + reload for true RTL layout lands in MP9.
}

export { i18n };
