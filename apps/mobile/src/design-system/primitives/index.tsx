/**
 * Design-system primitives (§M16). Theme-driven, no business logic.
 * These are the building blocks every screen composes from.
 */
import React, { type ReactNode } from 'react';
import {
  View,
  Text as RNText,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme, type Theme } from '../../theme';
import type { TypographyVariant } from '../tokens';

type TextColor = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'danger';

export function Text({
  variant = 'body',
  color = 'primary',
  align = 'auto',
  style,
  children,
  numberOfLines,
}: {
  variant?: TypographyVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}): React.JSX.Element {
  const t = useTheme();
  const v = t.typography[variant];
  const colorMap: Record<TextColor, string> = {
    primary: t.colors.textPrimary,
    secondary: t.colors.textSecondary,
    tertiary: t.colors.textTertiary,
    inverse: t.colors.actionFg,
    danger: t.colors.danger,
  };
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: v.fontSize,
          lineHeight: v.lineHeight,
          fontFamily: v.fontFamily,
          letterSpacing: v.letterSpacing,
          color: colorMap[color],
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

export function Screen({
  children,
  padded = true,
  center = false,
  edges = ['top', 'bottom'],
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  center?: boolean;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[
        { flex: 1, backgroundColor: t.colors.bgBase },
        padded && { paddingHorizontal: t.spacing.xl },
        center && { justifyContent: 'center', alignItems: 'center' },
        style,
      ]}
    >
      {children}
    </SafeAreaView>
  );
}

// Strong "floating / lifted off the page" shadow for primary CTAs.
const POP_SHADOW = {
  shadowColor: '#000000',
  shadowOpacity: 0.28,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 14,
} as const;

export function PillButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  leadingIcon?: string;
  trailingIcon?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const t = useTheme();
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? 'inverse' : 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 56,
          borderRadius: t.radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.spacing.xs,
          paddingHorizontal: t.spacing.xl,
          backgroundColor: isPrimary ? t.colors.actionBg : 'transparent',
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        isPrimary && POP_SHADOW,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={isPrimary ? t.colors.actionFg : t.colors.textPrimary}
        />
      ) : (
        <>
          {leadingIcon ? (
            <Text variant="label" color={fg}>
              {leadingIcon}
            </Text>
          ) : null}
          <Text variant="label" color={fg}>
            {label}
          </Text>
          {trailingIcon ? (
            <Text variant="label" color={fg}>
              {trailingIcon}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

export function Row({
  children,
  gap = 0,
  align = 'center',
  justify = 'flex-start',
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Column({
  children,
  gap = 0,
  align = 'stretch',
  justify = 'flex-start',
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          flexDirection: 'column',
          alignItems: align,
          justifyContent: justify,
          gap,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.lg,
          padding: t.spacing.lg,
          borderWidth: t.scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
          borderColor: t.colors.hairline,
        },
        t.elevation.e1,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: t.colors.hairline,
        },
        style,
      ]}
    />
  );
}

export type { Theme };
