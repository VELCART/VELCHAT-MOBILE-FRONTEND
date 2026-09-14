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

const BUBBLE_MAX_WIDTH = '78%';
const TAIL_RADIUS = 6;
const GAP_WITHIN_RUN = 3;
const GAP_BETWEEN_RUNS = 12;

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
            paddingHorizontal: 12,
            // Horizontal padding is what stops the text touching the edge; vertical padding
            // just makes the bubble tall. Keep the former, spend less on the latter.
            paddingVertical: 5,
            borderRadius: R,
            borderTopRightRadius: mine && firstOfRun ? TAIL_RADIUS : R,
            borderTopLeftRadius: !mine && firstOfRun ? TAIL_RADIUS : R,
            backgroundColor: mine
              ? t.colors.brandFrom
              : (incomingTint ?? t.colors.bgSubtle),
            // An incoming bubble is `bgSubtle` on `bgBase`. In dark those are #121214 on
            // #0A0A0B — so close in value that the bubble barely reads as a shape at all.
            // A hairline gives it an edge, which is exactly what §design-direction
            // prescribes for dark (shadows don't register on a near-black ground). On a
            // decorated wallpaper the border comes from the wallpaper instead, in both schemes.
            ...(mine
              ? null
              : incomingBorder !== null
                ? { borderWidth: 1, borderColor: incomingBorder }
                : t.scheme === 'dark'
                  ? { borderWidth: 1, borderColor: t.colors.hairline }
                  : null),
          }}
        >
          <Text
            variant="body"
            style={{
              fontSize: 15,
              lineHeight: 19,
              color: mine ? t.colors.actionFg : t.colors.textPrimary,
            }}
          >
            {contentPlain}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              alignSelf: 'flex-end',
              // The meta row sits tight under the text — it is a footnote, not a second
              // paragraph, and the gap here was a visible chunk of each bubble's height.
              marginTop: 0,
            }}
          >
            <Text
              variant="caption"
              style={{
                fontSize: 11,
                color: mine ? t.colors.actionFg : t.colors.textTertiary,
                opacity: mine ? 0.75 : 1,
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
