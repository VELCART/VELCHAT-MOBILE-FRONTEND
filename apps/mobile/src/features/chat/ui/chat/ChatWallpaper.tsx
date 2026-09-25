/**
 * The ground a chat thread sits on (§F2).
 *
 * Absolutely positioned BEHIND the message list and never re-rendered while the list moves: the
 * wallpaper is fixed, so the blooms are drawn once and then cost nothing. That is the whole
 * reason the frosted look is painted rather than blurred — a live `BlurView` under a scrolling
 * FlashList recomposites every frame, which the §M0 reference device (3 GB, Android 10) cannot
 * spend (CLAUDE.md: "no heavy blur stacks on the render path").
 *
 * `plain` renders a single flat rect, so the default chat is exactly as cheap as it was before
 * wallpapers existed.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../../../theme';
import { wallpaperPaint, type WallpaperId } from '../../model/wallpaper';

function ChatWallpaperBase({ id }: { id: WallpaperId }): React.JSX.Element {
  const t = useTheme();
  const paint = wallpaperPaint(id, t.scheme);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {paint.blooms.map((b, i) => (
            <RadialGradient
              key={`g${String(i)}`}
              id={`bloom${String(i)}`}
              cx={`${String(b.cx * 100)}%`}
              cy={`${String(b.cy * 100)}%`}
              rx={`${String(b.r * 100)}%`}
              ry={`${String(b.r * 100)}%`}
              gradientUnits="objectBoundingBox"
            >
              <Stop offset="0" stopColor={b.color} stopOpacity={b.opacity} />
              <Stop offset="1" stopColor={b.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={paint.base} />
        {paint.blooms.map((_, i) => (
          <Rect
            key={`r${String(i)}`}
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#bloom${String(i)})`}
          />
        ))}
      </Svg>
    </View>
  );
}

/**
 * Memoised on `id` alone. The theme is read inside, so a light/dark switch still repaints —
 * but a new message, a receipt or a scroll never does.
 */
export const ChatWallpaper = React.memo(ChatWallpaperBase);
