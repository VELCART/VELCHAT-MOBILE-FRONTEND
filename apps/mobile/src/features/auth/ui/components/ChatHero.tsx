/**
 * ChatHero (§F1) — the onboarding hero: a person cut-out with three floating chat
 * bubbles composed as crisp, theme-aware UI (not baked into the image), so the
 * copy stays sharp, has no typos, and adapts to light/dark. Bubbles fade+slide in
 * on mount (staggered) and drift gently. Reused by Welcome + SignIn.
 *
 * Drop a transparent PNG cut-out of the person (no baked bubbles) at
 * ./assets/wlcom_hero.png — it renders centered behind the bubbles.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  Animated,
  ImageSourcePropType,
  AccessibilityInfo,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../../../theme';
import { Text, FadeInUp } from '../../../../design-system';
import HERO from '../assets/singin.png';
import USER1 from '../assets/user1.jpeg';
import USER2 from '../assets/user2.png';

/** Slow, native-driver vertical drift; snaps to still when reduce-motion is on. */
function useFloat(
  amplitude: number,
  duration: number,
  delay: number,
): Animated.AnimatedInterpolation<number> {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    let anim: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(rm => {
        if (!active || rm) return;
        anim = Animated.loop(
          Animated.sequence([
            Animated.timing(v, {
              toValue: 1,
              duration,
              delay,
              useNativeDriver: true,
            }),
            Animated.timing(v, { toValue: 0, duration, useNativeDriver: true }),
          ]),
        );
        anim.start();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      anim?.stop();
    };
  }, [v, duration, delay]);
  return v.interpolate({ inputRange: [0, 1], outputRange: [0, -amplitude] });
}

function Avatar({ source }: { source: ImageSourcePropType }) {
  return (
    <Image
      source={source}
      style={{
        width: 35,
        height: 35,
        borderRadius: 24,
      }}
      resizeMode="cover"
    />
  );
}

function Bubble({
  side,
  text,
  time,
  avatar,
  avatarSide = 'left',
  checks = false,
}: {
  side: 'in' | 'out';
  text: string;
  time: string;
  avatar?: ImageSourcePropType;
  avatarSide?: 'left' | 'right';
  checks?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  const out = side === 'out';
  const bg = out
    ? t.colors.info
    : t.scheme === 'dark'
      ? t.colors.surfaceElevated
      : t.colors.bgSubtle;
  const fg = out ? '#FFFFFF' : t.colors.textPrimary;
  const meta = out ? 'rgba(255,255,255,0.75)' : t.colors.textSecondary;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 4,
        alignSelf: out ? 'flex-end' : 'flex-start',
      }}
    >
      {!out && avatar && avatarSide === 'left' ? (
        <Avatar source={avatar} />
      ) : null}
      <View
        style={{
          maxWidth: 160,
          backgroundColor: bg,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: 18,
          borderBottomLeftRadius: out ? 18 : 6,
          borderBottomRightRadius: out ? 6 : 18,
        }}
      >
        <Text
          variant="body"
          style={{ fontSize: 12.5, lineHeight: 22, color: fg }}
        >
          {text}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            marginTop: 2,
            alignSelf: 'flex-end',
          }}
        >
          <Text variant="caption" style={{ fontSize: 11, color: meta }}>
            {time}
          </Text>
          {checks ? (
            <Text variant="caption" style={{ fontSize: 11, color: '#FFFFFF' }}>
              ✓
            </Text>
          ) : null}
        </View>
      </View>
      {!out && avatar && avatarSide === 'right' ? (
        <Avatar source={avatar} />
      ) : null}
    </View>
  );
}

/** A bubble that drifts (float) and enters (fade+slide), stacked. */
function FloatingBubble({
  amplitude,
  duration,
  delay,
  position,
  children,
}: {
  amplitude: number;
  duration: number;
  delay: number;
  position: StyleProp<ViewStyle>;
  children: React.ReactNode;
}): React.JSX.Element {
  const translateY = useFloat(amplitude, duration, delay);
  return (
    <Animated.View
      style={[
        { position: 'absolute' },
        position,
        { transform: [{ translateY }] },
      ]}
    >
      <FadeInUp delay={delay} distance={14}>
        {children}
      </FadeInUp>
    </Animated.View>
  );
}

export function ChatHero({
  height = 480,
  style,
}: {
  height?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View style={[{ width: '100%', height }, style]}>
      <Image
        source={HERO}
        resizeMode="contain"
        style={{ width: '100%', height, alignSelf: 'center' }}
      />

      <FloatingBubble
        amplitude={7}
        duration={2800}
        delay={220}
        position={{ top: height * 0.34, left: -15 }}
      >
        <Bubble
          side="in"
          text="Hey! How are you?"
          time="10:30 AM"
          avatar={USER1}
          avatarSide="left"
        />
      </FloatingBubble>

      <FloatingBubble
        amplitude={9}
        duration={3200}
        delay={420}
        position={{ top: height * 0.42, right: -10 }}
      >
        <Bubble side="out" text="I'm good! 😄" time="10:31 AM" checks />
      </FloatingBubble>

      <FloatingBubble
        amplitude={6}
        duration={2600}
        delay={620}
        position={{ top: height * 0.62, right: -10 }}
      >
        <Bubble
          side="in"
          text="Let's catch up later!"
          time="10:32 AM"
          avatar={USER2}
        />
      </FloatingBubble>
    </View>
  );
}
