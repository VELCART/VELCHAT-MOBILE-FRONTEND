/**
 * A single message row (§F2/§L6) — WhatsApp's bubble, built to its own geometry, in this app's
 * near-monochrome palette.
 *
 * Four things here are load-bearing, each of them a bug that was actually seen on device:
 *
 *  - THE TAIL IS A SHAPE, not a smaller corner radius. The first bubble of a run squares the
 *    corner it grows from and hangs an 8x13 curved spike off it (see BubbleTail). It lives in
 *    the gutter the bubble's own margin leaves, so its offset is `0`, not `-TAIL_WIDTH`:
 *    offsetting it again by the same width put an 8dp gap between bubble and tail, which read
 *    as a small triangle floating beside every message.
 *
 *  - THE TIME SITS ON THE LAST LINE OF TEXT when it fits, and drops to its own line when it
 *    does not. Not a layout any flexbox arrangement gives you: the meta's width is reserved
 *    inside the text flow with blank figure spaces and the real meta is drawn absolutely over
 *    that blank. Stacking the meta under the text spends a whole line on every short message.
 *
 *  - NOTHING CASTS A SHADOW. A version of this lifted each bubble with `elevation: 1`, which
 *    looks right in a screenshot and is a separate render pass per cell — with ~20 bubbles on
 *    screen the thread went from smooth to visibly hitchy. The incoming bubble is told apart
 *    from the ground by a hairline instead (§M0 worst-device-first).
 *
 *  - SWIPE RIGHT REPLIES, and so does a long press. The gesture is owned here, on the row, and
 *    claims the touch only for movement that is DOMINANTLY horizontal, so a vertical drag
 *    scrolls exactly as it did before one was attached — and the list can always take the
 *    responder back.
 *
 * Props are PRIMITIVES, not the DB row: WatermelonDB mutates its cached model in place, so a
 * memoised row keyed on the object reference would never see sending→sent→read. Passing the
 * mutable fields (state, contentPlain, time) as primitives makes the memo correct. The `time`
 * label arrives already formatted — ICU formatting is done once per emission by the screen,
 * never per row per render (§R4).
 */
import React, { useCallback } from 'react';
import { View, Text as RNText, Pressable } from 'react-native';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import { DateChip } from './DateChip';
import { BubbleTail, TAIL_WIDTH } from './BubbleTail';
import { QuotedMessage } from './QuotedMessage';
import { MessageTicks, sendStateLabel } from './MessageTicks';
import {
  CHAT_FONT,
  CHAT_BODY_SIZE,
  CHAT_BODY_LINE,
  CHAT_META_SIZE,
  CHAT_META_LINE,
} from './chatType';
import { chatPalette, quoteAccent } from '../../model/chatPalette';

const BUBBLE_MAX_WIDTH = '85%';
/** WhatsApp's bubble corner. Small — these are not pills. */
const R = 7.5;
const PAD_H = 9;
const PAD_TOP = 6;
const PAD_BOTTOM = 6;
/** Same-sender run spacing, WhatsApp's own: tight inside a run, a clear gap between runs. */
const GAP_WITHIN_RUN = 2;
const GAP_BETWEEN_RUNS = 12;

/**
 * The blank the timestamp is drawn over.
 *
 * One figure space per character of the label, plus four for the ticks when they are there. A
 * figure space is the width of a DIGIT, and a time label is mostly digits with a narrower colon
 * and space — so this over-reserves by a hair, and that surplus IS the gap between the sentence
 * and the time. It can never come out negative, which is the only direction that would hurt.
 *
 * Whitespace, never a transparent copy of the label. A `color: 'transparent'` span of the real
 * text drew a visible ghost a pixel off the meta above it, so every bubble read as though its
 * timestamp had been struck through.
 */
function metaSpacer(time: string, mine: boolean): string {
  const FIGURE = ' ';
  return FIGURE.repeat(time.length + (mine ? 4 : 1));
}

export interface QuotedPreview {
  readonly author: string;
  readonly preview: string;
  readonly mine: boolean;
}

interface MessageBubbleProps {
  contentPlain: string;
  mine: boolean;
  state: string;
  /** Pre-formatted time-of-day (see `compactTime`) — not a timestamp. */
  time: string;
  id: string;
  clientMsgId: string;
  firstOfRun: boolean;
  dateLabel: string | null;
  onRetry: (clientMsgId: string) => void;
  /** Swipe right, or long press. Both mean: answer THIS one. */
  onReply: (id: string) => void;
  /** Tap the quote panel to go to what was quoted. Undefined when the original is not held. */
  onJumpToQuoted?: ((id: string) => void) | undefined;
  /** What this message is a reply to, already resolved by the screen. */
  quoted?: QuotedPreview | undefined;
  quotedId?: string | undefined;
  /**
   * Incoming-bubble override for the chat's wallpaper (§F2). `null` keeps the theme's value.
   * The tail reads the SAME string, so the two can never come apart.
   */
  incomingTint?: string | null;
}

function MessageBubbleBase({
  contentPlain,
  mine,
  state,
  time,
  id,
  clientMsgId,
  firstOfRun,
  dateLabel,
  onRetry,
  onReply,
  onJumpToQuoted,
  quoted,
  quotedId,
  incomingTint = null,
}: MessageBubbleProps): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const c = chatPalette(t.scheme);

  const fill = mine ? c.outgoingBg : (incomingTint ?? c.incomingBg);
  const textColor = mine ? c.outgoingText : c.incomingText;
  const metaColor = mine ? c.outgoingMeta : c.incomingMeta;
  const topGap = dateLabel ? 0 : firstOfRun ? GAP_BETWEEN_RUNS : GAP_WITHIN_RUN;

  const fireReply = useCallback(() => onReply(id), [onReply, id]);

  /**
   * There is deliberately NO per-row entrance animation, and this is measured rather than
   * assumed. Wrapping each row in an `Animated.View` to scale a newly sent bubble in took the
   * thread from 7.1% janky frames to 12.8% (p90 34ms → 53ms, six swipe cycles, release build
   * on the reference emulator); adding the swipe-to-reply pan responder on top took it to
   * 19.8% / 48ms with input latency to match. A list cell is the one place in an app where a
   * per-item animated node is never free.
   *
   * Nothing is lost by it: a sent message in WhatsApp does not travel to the bottom either —
   * it is already there, which is exactly what the owner asked for ("direct upar hi"). The send
   * gesture gets its feedback on the SEND BUTTON instead, which is a single view outside the
   * list and costs the scroll nothing.
   */

  const jump = useCallback(() => {
    if (quotedId && onJumpToQuoted) onJumpToQuoted(quotedId);
  }, [quotedId, onJumpToQuoted]);

  // One label for the whole row. The ticks and the quote are decorative to a screen reader:
  // announced separately they arrive out of order and read as gibberish between messages.
  const a11yLabel = [
    quoted ? tr('chat.a11yQuoting', { author: quoted.author }) : null,
    contentPlain,
    time,
    mine ? sendStateLabel(state, tr) : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View>
      {dateLabel ? <DateChip label={dateLabel} tint={incomingTint} /> : null}
      <View style={{ paddingTop: topGap, justifyContent: 'center' }}>
        <View
          style={{
            paddingHorizontal: t.spacing.xs,
            alignItems: mine ? 'flex-end' : 'flex-start',
          }}
        >
          <View
            style={{
              maxWidth: BUBBLE_MAX_WIDTH,
              // The gutter the tail hangs in. Keeping it as a margin means the tail never
              // widens the bubble and the list never scrolls sideways.
              marginLeft: mine ? 0 : TAIL_WIDTH,
              marginRight: mine ? TAIL_WIDTH : 0,
            }}
          >
            {firstOfRun ? (
              <View
                pointerEvents="none"
                // `0`, not `-TAIL_WIDTH`: the margin above already inset the bubble by exactly
                // one tail-width, so this box IS the gutter.
                style={{
                  position: 'absolute',
                  top: 0,
                  ...(mine ? { right: 0 } : { left: 0 }),
                }}
              >
                <BubbleTail mine={mine} color={fill} />
              </View>
            ) : null}

            <Pressable
              accessible
              accessibilityRole="text"
              accessibilityLabel={a11yLabel}
              accessibilityHint={tr('chat.replyHint')}
              onLongPress={fireReply}
              delayLongPress={300}
              style={({ pressed }) => ({
                paddingHorizontal: PAD_H,
                paddingTop: PAD_TOP,
                paddingBottom: PAD_BOTTOM,
                borderRadius: R,
                // The tail replaces the corner it grows from — WhatsApp squares it.
                borderTopRightRadius: mine && firstOfRun ? 0 : R,
                borderTopLeftRadius: !mine && firstOfRun ? 0 : R,
                backgroundColor: fill,
                opacity: pressed ? 0.88 : 1,
                // An incoming bubble is a subtle fill on a near-identical ground — about
                // 1.04:1 in light and 1.06:1 in dark, far under the 3:1 WCAG 1.4.11 asks of a
                // component boundary — so without this it has no perceptible shape (VC-060).
                // The outgoing bubble is the brand fill and needs nothing.
                ...(mine
                  ? null
                  : { borderWidth: 1, borderColor: c.bubbleBorder }),
              })}
            >
              {quoted ? (
                <Pressable
                  onPress={jump}
                  disabled={!quotedId || !onJumpToQuoted}
                  accessibilityRole="button"
                  accessibilityLabel={tr('chat.a11yQuoting', {
                    author: quoted.author,
                  })}
                  style={({ pressed }) => ({
                    alignSelf: 'stretch',
                    marginBottom: 4,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <QuotedMessage
                    author={quoted.author}
                    preview={quoted.preview}
                    accent={quoteAccent(c, mine)}
                    background={
                      mine ? c.quoteInOutgoingBg : c.quoteInIncomingBg
                    }
                    previewColor={
                      mine ? c.quoteTextOnOutgoing : c.quoteTextOnIncoming
                    }
                  />
                </Pressable>
              ) : null}

              <RNText
                style={{
                  fontFamily: CHAT_FONT,
                  fontSize: CHAT_BODY_SIZE,
                  lineHeight: CHAT_BODY_LINE,
                  color: textColor,
                }}
              >
                {contentPlain}
                <RNText
                  style={{
                    fontFamily: CHAT_FONT,
                    fontSize: CHAT_META_SIZE,
                    lineHeight: CHAT_META_LINE,
                  }}
                >
                  {metaSpacer(time, mine)}
                </RNText>
              </RNText>

              <View
                pointerEvents={state === 'failed' ? 'auto' : 'none'}
                style={{
                  position: 'absolute',
                  right: PAD_H,
                  bottom: PAD_BOTTOM - 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <RNText
                  style={{
                    fontFamily: CHAT_FONT,
                    fontSize: CHAT_META_SIZE,
                    lineHeight: CHAT_META_LINE,
                    color: metaColor,
                  }}
                >
                  {time}
                </RNText>
                {mine ? (
                  <MessageTicks
                    state={state}
                    idleColor={metaColor}
                    readColor={c.tickRead}
                    failedColor={t.colors.danger}
                    onRetry={() => onRetry(clientMsgId)}
                  />
                ) : null}
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export const MessageBubble = React.memo(MessageBubbleBase);
