/**
 * A single message row (§F2/§L6): an optional date separator, then the bubble — mine on the
 * right (brand fill / inverse text), theirs on the left (subtle fill / primary text). Same-
 * sender runs are grouped tight; only the FIRST (top) bubble of a run carries the corner
 * tail. Mine keep the per-state send indicator (clock, one check, two checks, blue when read,
 * and a tappable alert when the send failed) — drawn icons, never typeset characters.
 *
 * Props are PRIMITIVES, not the DB row: WatermelonDB mutates its cached model in place, so a
 * memoised row keyed on the object reference would never see sending→sent→read. Passing the
 * mutable fields (state, contentPlain, time) as primitives makes the memo correct. The `time`
 * label arrives already formatted — ICU formatting is done once per emission by the screen,
 * never per row per render (§R4).
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import {
  Text,
  ClockIcon,
  CheckIcon,
  DoubleCheckIcon,
  AlertCircleIcon,
} from '../../../../design-system';
import { DateChip } from './DateChip';

const BUBBLE_MAX_WIDTH = '80%';
const TAIL_RADIUS = 4;
const GAP_WITHIN_RUN = 2;
const GAP_BETWEEN_RUNS = 10;

/**
 * Per-state send indicator for MY messages: a clock while sending, one check when sent,
 * double checks when delivered, blue double checks when read, and a tappable failed marker —
 * so a failed send never masquerades as delivered (the WhatsApp contract).
 */
function SendStatus({
  state,
  onRetry,
}: {
  state: string;
  onRetry: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  if (state === 'sending') {
    return <ClockIcon size={13} color={t.colors.actionFg} strokeWidth={2} />;
  }
  if (state === 'failed') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('newChat.retry')}
        onPress={onRetry}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <AlertCircleIcon size={15} color={t.colors.danger} />
      </Pressable>
    );
  }
  // `read` is the one state that earns colour, at full strength. Everything else rides the
  // bubble's own foreground, dimmed so the ticks never compete with the message text — the
  // opacity lives on a wrapper because an Svg does not take one directly.
  if (state === 'read') {
    return <DoubleCheckIcon size={16} color={t.colors.info} />;
  }
  return (
    <View style={{ opacity: 0.78 }}>
      {state === 'sent' ? (
        <CheckIcon size={16} color={t.colors.actionFg} strokeWidth={1.7} />
      ) : (
        <DoubleCheckIcon
          size={16}
          color={t.colors.actionFg}
          strokeWidth={1.7}
        />
      )}
    </View>
  );
}

interface MessageBubbleProps {
  contentPlain: string;
  mine: boolean;
  state: string;
  /** Pre-formatted time-of-day (see `compactTime`) — not a timestamp. */
  time: string;
  clientMsgId: string;
  firstOfRun: boolean;
  dateLabel: string | null;
  onRetry: (clientMsgId: string) => void;
  /**
   * Incoming-bubble overrides for the chat's wallpaper (§F2). A decorated ground needs a
   * translucent bubble, or an opaque `bgSubtle` rectangle sits on the wash like a sticker.
   * `null` (the `plain` wallpaper) keeps the theme's own values.
   */
  incomingTint?: string | null;
  incomingBorder?: string | null;
}

function MessageBubbleBase({
  contentPlain,
  mine,
  state,
  time,
  clientMsgId,
  firstOfRun,
  dateLabel,
  onRetry,
  incomingTint = null,
  incomingBorder = null,
}: MessageBubbleProps): React.JSX.Element {
  const t = useTheme();
  const R = t.radius.lg;
  const topGap = dateLabel ? 0 : firstOfRun ? GAP_BETWEEN_RUNS : GAP_WITHIN_RUN;
  return (
    <View>
      {dateLabel ? <DateChip label={dateLabel} /> : null}
      <View
        style={{
          paddingHorizontal: t.spacing.md,
          paddingTop: topGap,
          alignItems: mine ? 'flex-end' : 'flex-start',
        }}
      >
        <View
          style={{
            maxWidth: BUBBLE_MAX_WIDTH,
            paddingHorizontal: 14,
            paddingTop: 8,
            paddingBottom: 6,
            borderRadius: R,
            borderTopRightRadius: mine && firstOfRun ? TAIL_RADIUS : R,
            borderTopLeftRadius: !mine && firstOfRun ? TAIL_RADIUS : R,
            backgroundColor: mine
              ? t.colors.brandFrom
              : (incomingTint ?? t.colors.bgSubtle),
            // An incoming bubble is `bgSubtle` on `bgBase`, and in BOTH schemes those are far
            // too close to read as a shape on their own: #121214 on #0A0A0B in dark, and
            // #F7F7F8 on #FFFFFF in light — about 1.04:1, well under the 3:1 WCAG 1.4.11 asks
            // of a component boundary. The hairline used to be dark-only, so the default
            // light + plain combination shipped with bubbles that had no edge at all (VC-060).
            // On a decorated wallpaper the border comes from the wallpaper instead.
            ...(mine
              ? null
              : {
                  borderWidth: 1,
                  borderColor: incomingBorder ?? t.colors.hairline,
                }),
          }}
        >
          <Text
            variant="body"
            style={{
              fontSize: 15.5,
              lineHeight: 21,
              color: mine ? t.colors.actionFg : t.colors.textPrimary,
            }}
          >
            {contentPlain}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              alignSelf: 'flex-end',
              marginTop: 2,
            }}
          >
            <Text
              variant="caption"
              style={{
                fontSize: 10.5,
                lineHeight: 14,
                color: mine ? t.colors.actionFg : t.colors.textTertiary,
                opacity: mine ? 0.7 : 0.8,
              }}
            >
              {time}
            </Text>
            {mine ? (
              <SendStatus state={state} onRetry={() => onRetry(clientMsgId)} />
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

export const MessageBubble = React.memo(MessageBubbleBase);
