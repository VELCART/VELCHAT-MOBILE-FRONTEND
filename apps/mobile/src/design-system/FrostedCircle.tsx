/**
 * FrostedCircle (§M16) — a premium frosted-glass disc: a REAL gaussian blur of whatever
 * is behind it (@react-native-community/blur), a milky theme-aware tint, a glossy sheen
 * + specular highlight + light rim (GlassBubble), and the caller's content on top.
 *
 * The blur module is loaded lazily and guarded: if the native side isn't in the binary
 * yet (dep added but app not rebuilt) it falls back to a heavier translucent tint so the
 * disc still reads as glass and NOTHING crashes — the blur simply appears after a rebuild.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { GlassBubble } from './GlassBubble';

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
      }}
    >
      {BlurView ? (
        <BlurView
          style={StyleSheet.absoluteFill as ViewStyle}
          blurType={dark ? 'dark' : 'light'}
          blurAmount={24}
          reducedTransparencyFallbackColor={
            dark ? 'rgba(28,28,30,0.55)' : 'rgba(255,255,255,0.45)'
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
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.16)',
          },
        ]}
      />
      {/* Glossy sheen + specular highlight + light rim on top of the frost. */}
      <GlassBubble size={size} />
      {children}
    </View>
  );
}
