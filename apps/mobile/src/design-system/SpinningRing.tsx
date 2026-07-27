/**
 * SpinningRing (§M16 motion) — a dashed circular ring that rotates forever. Used as
 * an "active" halo around the header avatar. Native-driver rotate (off the JS thread);
 * snaps still when reduce-motion is on. Renders nothing but the ring — position it
 * absolutely over/around the element it decorates.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, AccessibilityInfo } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export function SpinningRing({
  size,
  color,
  thickness = 2.5,
  durationMs = 3500,
  dash = '4 6',
}: {
  size: number;
  color: string;
  thickness?: number;
  durationMs?: number;
  /** SVG strokeDasharray — "dash gap" → the gaps between segments. */
  dash?: string;
}): React.JSX.Element {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    let anim: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(rm => {
        if (!active || rm) return;
        anim = Animated.loop(
          Animated.timing(spin, {
            toValue: 1,
            duration: durationMs,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        anim.start();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      anim?.stop();
    };
  }, [spin, durationMs]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const r = (size - thickness) / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        transform: [{ rotate }],
      }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={dash}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}
