/**
 * i18n/ — translations, ICU, RTL utils (§M18).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export {
  i18n,
  setAppLanguage,
  isRTLLanguage,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
} from './config';
export type { AppLanguage } from './config';
export { I18nProvider, useLanguage } from './I18nProvider';
export { useTranslation } from 'react-i18next';
