/**
 * AvatarOrbit (§M16) — the hero motif from docs/design-direction: a central
 * avatar surrounded by a ring of squircle avatars over faint concentric rings.
 * Matches the provided reference "orbit of people" welcome art.
 */
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { Avatar, type AvatarTone } from './primitives/Avatar';

const SIZE = 300;
const CENTER = SIZE / 2;

interface Tile {
  a: number; // angle (deg)
  d: number; // distance from center
  s: number; // size
  tone: AvatarTone;
}

const TILES: readonly Tile[] = [
  { a: -90, d: 104, s: 60, tone: 'gray' },
  { a: -52, d: 112, s: 50, tone: 'blue' },
  { a: -14, d: 120, s: 44, tone: 'gray' },
  { a: 26, d: 106, s: 50, tone: 'gray' },
  { a: 64, d: 118, s: 44, tone: 'warm' },
  { a: 104, d: 102, s: 60, tone: 'gray' },
  { a: 142, d: 116, s: 44, tone: 'gray' },
  { a: 180, d: 108, s: 50, tone: 'gray' },
  { a: 218, d: 120, s: 44, tone: 'blue' },
  { a: 250, d: 108, s: 50, tone: 'gray' },
];

function Ring({ diameter, opacity }: { diameter: number; opacity: number }): React.JSX.Element {
  const t = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: CENTER - diameter / 2,
        left: CENTER - diameter / 2,
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        borderWidth: 1.5,
        borderColor: t.colors.hairline,
        opacity,
      }}
    />
  );
}

export function AvatarOrbit(): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Ring diameter={288} opacity={0.5} />
      <Ring diameter={222} opacity={0.9} />
      <Ring diameter={150} opacity={0.9} />

      {TILES.map((tile, i) => {
        const rad = (tile.a * Math.PI) / 180;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: CENTER + tile.d * Math.cos(rad) - tile.s / 2,
              top: CENTER + tile.d * Math.sin(rad) - tile.s / 2,
            }}
          >
            <Avatar size={tile.s} shape="squircle" tone={tile.tone} />
          </View>
        );
      })}

      {/* central avatar with a ring cut into the concentric rings */}
      <View
        style={{
          position: 'absolute',
          top: CENTER - 53,
          left: CENTER - 53,
          width: 106,
          height: 106,
          borderRadius: 53,
          backgroundColor: t.colors.bgBase,
          alignItems: 'center',
          justifyContent: 'center',
          ...t.elevation.e2,
        }}
      >
        <Avatar size={92} shape="circle" tone="gray" />
      </View>
    </View>
  );
}
