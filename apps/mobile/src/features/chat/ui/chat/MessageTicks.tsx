/**
 * Send-state ticks (§F2) — WhatsApp's own tick glyphs, filled, not the app's stroke-outline
 * check icon.
 *
 * The difference matters at 11sp: a 2px stroked check has the same visual weight as the
 * timestamp beside it and the two blur into one grey smudge, which is why the state of a
 * message was hard to read at a glance. WhatsApp's ticks are a filled hairline shape — lighter
 * than the text next to them until `read` turns them blue, which is the one state that is meant
 * to catch the eye.
 *
 * States, in order: sending (clock) → sent (one tick) → delivered (two) → read (two, blue), and
 * failed, which is a button because it is the only one the user can act on.
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from '../../../../i18n';
import { ClockIcon, AlertCircleIcon } from '../../../../design-system';

const TICK_W = 16;
const TICK_H = 15;

const SINGLE =
  'M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z';
const DOUBLE =
  'M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z';

function Ticks({
  double,
  color,
}: {
  double: boolean;
  color: string;
}): React.JSX.Element {
  return (
    <Svg width={TICK_W} height={TICK_H} viewBox={`0 0 ${TICK_W} ${TICK_H}`}>
      <Path d={double ? DOUBLE : SINGLE} fill={color} />
    </Svg>
  );
}

export function MessageTicks({
  state,
  idleColor,
  readColor,
  failedColor,
  onRetry,
}: {
  state: string;
  idleColor: string;
  readColor: string;
  failedColor: string;
  onRetry: () => void;
}): React.JSX.Element {
  const { t: tr } = useTranslation();
  if (state === 'sending') {
    return <ClockIcon size={12} color={idleColor} strokeWidth={2} />;
  }
  if (state === 'failed') {
    return (
      // 15dp of slop around a 14dp glyph clears the 44dp floor the tokens define
      // (`hitSlop.minTarget`), and the label says what FAILED rather than borrowing
      // "Try again" from another feature with no context.
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tr('chat.state.failed')}`}
        onPress={onRetry}
        hitSlop={15}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <AlertCircleIcon size={14} color={failedColor} />
      </Pressable>
    );
  }
  if (state === 'read') {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ticks double color={readColor} />
      </View>
    );
  }
  // `delivered` is the ONLY state that earns the second tick. The fallback used to be
  // "anything that is not sent gets two", so an unknown or corrupted state silently rendered
  // as delivered — the exact thing this component exists to prevent. Unknown now under-claims.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ticks double={state === 'delivered'} color={idleColor} />
    </View>
  );
}

/**
 * What TalkBack reads for a send state, so the ticks are not silent decoration. Pure — the
 * caller composes it into the row's single accessibility label rather than letting the icons
 * announce themselves out of order.
 */
export function sendStateLabel(
  state: string,
  tr: (key: string) => string,
): string {
  if (state === 'sending') return tr('chat.state.sending');
  if (state === 'failed') return tr('chat.state.failed');
  if (state === 'read') return tr('chat.state.read');
  if (state === 'delivered') return tr('chat.state.delivered');
  return tr('chat.state.sent');
}
