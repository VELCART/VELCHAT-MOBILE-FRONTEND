/**
 * theme/ — light/dark/system, dynamic (§M16).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export {
  ThemeProvider,
  useTheme,
  useThemeMode,
  buildTheme,
} from './ThemeProvider';
export type { Theme, ColorScheme, ThemeMode } from './ThemeProvider';
