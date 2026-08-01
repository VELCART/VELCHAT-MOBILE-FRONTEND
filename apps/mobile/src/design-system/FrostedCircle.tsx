/**
 * FrostedCircle (§M16) — a premium frosted-glass disc: a REAL gaussian blur of whatever
 * is behind it (@react-native-community/blur), a milky tint, and a thin theme-aware rim,
 * with the caller's content on top.
 *
 * The blur module is loaded lazily and guarded: if the native side isn't in the binary
 * yet (dep added but app not rebuilt) it falls back to a heavier translucent tint so the
 * disc still reads as glass and NOTHING crashes — the blur simply appears after a rebuild.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

type BlurComponent = React.ComponentType<{
  style?: ViewStyle | ViewStyle[];
  blurType?: string;
  blurAmount?: number;
  reducedTransparencyFallbackColor?: string;
}>;

function loadBlurView(): BlurComponent | null {
  try {
    return require('@react-native-community/blur').BlurView as BlurComponent;
  } catch {
    return null;
  }
}

export function FrostedCircle({
  size = 64,
  children,
}: {
  size?: number;
  children?: React.ReactNode;
}): React.JSX.Element {
  const t = useTheme();
  const BlurView = loadBlurView();
  const dark = t.scheme === 'dark';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        // Thin, theme-aware rim.
        borderWidth: 1,
        borderColor: t.colors.hairline,
      }}
    >
      {BlurView ? (
        <BlurView
          style={StyleSheet.absoluteFill as ViewStyle}
          blurType={dark ? 'dark' : 'light'}
          blurAmount={20}
          reducedTransparencyFallbackColor={
            dark ? 'rgba(180, 180, 187, 0.65)' : 'rgba(255, 255, 255, 0.48)'
          }
        />
      ) : null}
      {/* Milky tint — a touch heavier when there's no native blur so the fallback
          still reads as frosted glass. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: BlurView
              ? 'rgba(209, 202, 202, 0.5)'
              : 'rgba(221, 217, 217, 0.45)',
          },
        ]}
      />
      {children}
    </View>
  );
}
