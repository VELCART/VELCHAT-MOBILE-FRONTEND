/**
 * The "…" bubble at the foot of the thread while the peer is typing (§C4).
 *
 * Shaped exactly like one of their messages — same fill, same corner, same tail — because that
 * is what it is announcing: a message that is on its way. The three dots rise and fade in
 * sequence rather than blinking together, which is what makes it read as *someone typing*
 * rather than as a loading spinner.
 *
 * GREEN, at the owner's request: the dots carry the thread's one accent colour, so the signal
 * is legible from the corner of the eye without reading anything.
 *
 * Everything is driven natively (`useNativeDriver`) so a loop that runs for as long as someone
 * is typing costs the JS thread nothing (§M0), and the whole animation is owned and stopped on
 * unmount (§M7).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import { BubbleTail, TAIL_WIDTH } from './BubbleTail';
import { chatPalette } from '../../model/chatPalette';

const DOT = 7;
const CYCLE_MS = 1000;
const STAGGER_MS = 160;
const RISE_MS = 250;
const FALL_MS = 250;

function Dot({
  delay,
  color,
}: {
  delay: number;
  color: string;
}): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: RISE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: FALL_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        // Pad the rest of the cycle so every dot's loop is the SAME length and the three stay
        // in step. Clamped at zero: the third dot's stagger plus the rise and fall came to more
        // than the cycle, which made this a NEGATIVE delay — the dots drifted out of phase and
        // the wave turned into a flicker.
        Animated.delay(Math.max(0, CYCLE_MS - delay - RISE_MS - FALL_MS)),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);

  return (
    <Animated.View
      style={{
        width: DOT,
        height: DOT,
        borderRadius: DOT / 2,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
        transform: [
          {
            translateY: v.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -3.5],
            }),
          },
        ],
      }}
    />
  );
}

export function TypingBubble({
  incomingTint = null,
}: {
  incomingTint?: string | null;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const c = useMemo(() => chatPalette(t.scheme), [t.scheme]);
  const fill = incomingTint ?? c.incomingBg;

  return (
    <View
      style={{
        paddingTop: 12,
        paddingHorizontal: t.spacing.xs,
        alignItems: 'flex-start',
      }}
    >
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={tr('chat.typing')}
        accessibilityLiveRegion="polite"
        style={{ marginLeft: TAIL_WIDTH }}
      >
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <BubbleTail mine={false} color={fill} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 12,
            height: 34,
            borderRadius: 7.5,
            borderTopLeftRadius: 0,
            backgroundColor: fill,
            borderWidth: 1,
            borderColor: c.bubbleBorder,
          }}
        >
          <Dot delay={0} color={c.typing} />
          <Dot delay={STAGGER_MS} color={c.typing} />
          <Dot delay={STAGGER_MS * 2} color={c.typing} />
        </View>
      </View>
    </View>
  );
}
