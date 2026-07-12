/**
 * Design tokens (§M16) — the single source of visual truth.
 * Values come from docs/design-direction.md: calm, premium, near-monochrome,
 * bold headings, pill CTAs, signature violet->pink gradient, light + dark.
 *
 * Pure data (no RN imports) so it is trivially testable and theme-agnostic.
 * light/dark share the ColorTokens/ElevationSet shapes so a theme can hold either.
 */

export interface ColorTokens {
  readonly bgBase: string;
  readonly bgSubtle: string;
  readonly surface: string;
  readonly surfaceElevated: string;
  readonly hairline: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textTertiary: string;
  readonly actionBg: string;
  readonly actionFg: string;
  readonly brandFrom: string;
  readonly brandTo: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
}

export const palette: { readonly light: ColorTokens; readonly dark: ColorTokens } = {
  light: {
    bgBase: '#FFFFFF',
    bgSubtle: '#F7F7F8',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    hairline: '#ECECEE',
    textPrimary: '#0B0B0C',
    textSecondary: '#8A8A8E',
    textTertiary: '#B0B0B5',
    actionBg: '#0B0B0C',
    actionFg: '#FFFFFF',
    brandFrom: '#7C5CFC',
    brandTo: '#FF6FB5',
    success: '#34C759',
    warning: '#FF9F0A',
    danger: '#FF3B30',
    info: '#0A84FF',
  },
  dark: {
    bgBase: '#0A0A0B',
    bgSubtle: '#121214',
    surface: '#1A1A1C',
    surfaceElevated: '#232326',
    hairline: '#2A2A2E',
    textPrimary: '#F5F5F7',
    textSecondary: '#9A9AA1',
    textTertiary: '#6E6E75',
    actionBg: '#FFFFFF',
    actionFg: '#0B0B0C',
    brandFrom: '#6E4BF0',
    brandTo: '#E85CA0',
    success: '#30D158',
    warning: '#FFD60A',
    danger: '#FF453A',
    info: '#0A84FF',
  },
};

/** Avatar placeholder pastels (both modes; dark applies at lower opacity). */
export const pastels = {
  mint: '#C9F2D6',
  pink: '#FFD3E6',
  blue: '#CFE3FF',
  yellow: '#FFEFB0',
  peach: '#FFE0C7',
  lavender: '#E5DBFF',
} as const;

/** 4-based spacing scale. */
export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
  giant: 64,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
  avatar: 22,
} as const;

/** Type scale (§M16). Platform system font (SF Pro / Roboto) by default. */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.7 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: 0 },
  label: { fontSize: 17, lineHeight: 20, fontWeight: '600', letterSpacing: -0.1 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500', letterSpacing: 0 },
} as const;

export type TypographyVariant = keyof typeof typography;

export interface ShadowStyle {
  readonly shadowColor: string;
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly elevation: number;
}

export interface ElevationSet {
  readonly e1: ShadowStyle;
  readonly e2: ShadowStyle;
  readonly e3: ShadowStyle;
}

/** Light-mode diffuse shadows; dark mode substitutes deeper shadows + hairline borders. */
export const elevation: { readonly light: ElevationSet; readonly dark: ElevationSet } = {
  light: {
    e1: { shadowColor: '#141428', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    e2: { shadowColor: '#141428', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
    e3: { shadowColor: '#141428', shadowOpacity: 0.14, shadowRadius: 40, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
  },
  dark: {
    e1: { shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    e2: { shadowColor: '#000000', shadowOpacity: 0.55, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
    e3: { shadowColor: '#000000', shadowOpacity: 0.6, shadowRadius: 40, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
  },
};

export const motion = {
  duration: { fast: 120, base: 260, slow: 400 },
  easing: { standard: [0.2, 0.7, 0.2, 1] as const },
  reduceMotionFadeMs: 100,
} as const;

export const hitSlop = { minTarget: 44 } as const; // §M18 min touch target
