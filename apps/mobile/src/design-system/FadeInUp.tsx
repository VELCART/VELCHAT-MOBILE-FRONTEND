/**
 * FadeInUp (§M16 motion) — entrance animation: fades + slides up on mount.
 * Uses RN's built-in Animated (native driver; no extra dependency) and honours
 * the OS "reduce motion" setting (§M18) by rendering instantly when enabled.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AccessibilityInfo,
  type ViewStyle,
  type StyleProp,
} from 'react-native';

export function FadeInUp({
  children,
  delay = 0,
  distance = 18,
  duration = 420,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, delay, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
