/**
 * Avatar (§M16). Circle (people) or squircle (grouped tiles). Renders a
 * monochrome portrait-style placeholder (head + shoulders) until a real image
 * is supplied — matches the docs/design-direction orbit motif. Theme-aware.
 */
import React from 'react';
import { View, Image, type ImageSourcePropType } from 'react-native';
import { useTheme } from '../../theme';

export type AvatarShape = 'circle' | 'squircle';
export type AvatarTone = 'gray' | 'blue' | 'warm';

function baseColor(tone: AvatarTone, dark: boolean): string {
  if (tone === 'blue') return dark ? '#3b4a63' : '#9db6d8';
  if (tone === 'warm') return dark ? '#5a4b38' : '#d8c3a9';
  return dark ? '#3a3a40' : '#c2c2c8';
}

export function Avatar({
  size,
  shape = 'circle',
  tone = 'gray',
  source,
}: {
  size: number;
  shape?: AvatarShape;
  tone?: AvatarTone;
  source?: ImageSourcePropType;
}): React.JSX.Element {
  const t = useTheme();
  const radius = shape === 'circle' ? size / 2 : size * 0.3;
  const bg = baseColor(tone, t.scheme === 'dark');
  const figure = t.scheme === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(20,20,28,0.30)';

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bg,
        overflow: 'hidden',
        ...t.elevation.e1,
      }}
    >
      {source ? (
        <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <>
          {/* soft top-left highlight for a photographic feel */}
          <View
            style={{
              position: 'absolute',
              top: -size * 0.25,
              left: -size * 0.2,
              width: size,
              height: size,
              borderRadius: size,
              backgroundColor: t.scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.35)',
            }}
          />
          {/* head */}
          <View
            style={{
              position: 'absolute',
              top: size * 0.24,
              alignSelf: 'center',
              width: size * 0.34,
              height: size * 0.34,
              borderRadius: size * 0.17,
              backgroundColor: figure,
            }}
          />
          {/* shoulders */}
          <View
            style={{
              position: 'absolute',
              bottom: -size * 0.18,
              left: size * 0.16,
              right: size * 0.16,
              height: size * 0.55,
              borderTopLeftRadius: size * 0.4,
              borderTopRightRadius: size * 0.4,
              backgroundColor: figure,
            }}
          />
        </>
      )}
    </View>
  );
}
