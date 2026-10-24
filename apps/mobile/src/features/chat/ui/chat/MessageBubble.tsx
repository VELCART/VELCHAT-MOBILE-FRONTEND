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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text as RNText, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
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
import { ReplyIcon } from '../../../../design-system';
import { chatPalette, quoteAccent } from '../../model/chatPalette';

const BUBBLE_MAX_WIDTH = '85%';
/**
 * The bubble's corner.
 *
 * 7.5 was WhatsApp's own value and it was WRONG HERE: against this app's rounded chrome —
 * 20dp cards, pill CTAs, a 28dp composer — a 7.5dp bubble reads as a hard box dropped into a
 * soft interface, which is exactly what the owner said when they saw it. Matching one app's
 * number out of context is not matching its design. 14 keeps the bubble unmistakably a bubble
 * (a single line is ~35dp tall, so this is not a pill either) and sits in the same family as
 * everything around it.
 */
const R = 14;
const PAD_H = 12;
const PAD_TOP = 7;
const PAD_BOTTOM = 7;
/** Same-sender run spacing, WhatsApp's own: tight inside a run, a clear gap between runs. */
const GAP_WITHIN_RUN = 2;
const GAP_BETWEEN_RUNS = 12;

/** How far the row travels, and how far it must travel to count as a reply. */
const SWIPE_MAX = 64;
const SWIPE_TRIGGER = 46;
/**
 * The two numbers that keep the gesture out of the list's way. A touch must move this far
 * rightward before the row takes it, and the gesture FAILS outright once it has moved this far
 * vertically — both evaluated natively, so an ordinary scroll never reaches javascript.
 */
const SWIPE_CLAIM_PX = 18;
const SWIPE_FAIL_Y = 12;

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

/** Hoisted: these never vary, and a fresh object per row per render is pure churn. */
const META_ROW = {
  position: 'absolute' as const,
  right: PAD_H,
  bottom: PAD_BOTTOM - 1,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 3,
};

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
  /** Swipe right: answer THIS one, with no menu in the way — WhatsApp's shortcut. */
  onReply: (id: string) => void;
  /** Long press: open the message's actions (reply, copy, delete). */
  onLongPress: (id: string, text: string, mine: boolean) => void;
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
  onLongPress,
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
  const openActions = useCallback(
    () => onLongPress(id, contentPlain, mine),
    [onLongPress, id, contentPlain, mine],
  );

  // ---- swipe right to reply (ADR-0011) --------------------------------------------------
  //
  // This was built twice. The first version used RN's own PanResponder and Animated, and it
  // took the thread from 3.2% janky frames to 19.8% — because PanResponder decides "scroll or
  // swipe?" on the JS thread, on the one surface whose whole job is to scroll, and
  // `useNativeDriver` cannot help with a decision.
  //
  // Here the decision is native: `activeOffsetX` and `failOffsetY` mean a dominantly VERTICAL
  // drag fails this gesture before javascript hears about it, so the list scrolls exactly as
  // it does with no gesture attached. The translation is a worklet on the UI thread. The only
  // JS hops in the whole interaction are the two `runOnJS` calls below: one to mount the
  // arrow, one to fire the reply.
  const dx = useSharedValue(0);
  const [swiping, setSwiping] = useState(false);

  // The gesture object must be built ONCE per cell, not once per message the cell is recycled
  // into. `GestureDetector` re-attaches the native handler whenever the gesture's identity
  // changes, and `fireReply` changes with `id` — so the first version of this tore down and
  // rebuilt a native gesture on every recycle, which is to say on every row that scrolled
  // past. Measured: 12-28% janky frames against a 3.9% baseline. Going through a ref keeps
  // the callback current while leaving the gesture's identity alone.
  const replyRef = useRef(fireReply);
  replyRef.current = fireReply;
  const fireReplyStable = useCallback(() => replyRef.current(), []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Claim only a clear rightward drag, and give up the moment it looks vertical.
        .activeOffsetX([-10000, SWIPE_CLAIM_PX])
        .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
        .onBegin(() => {
          'worklet';
          runOnJS(setSwiping)(true);
        })
        .onUpdate(e => {
          'worklet';
          const raw = Math.max(0, e.translationX);
          // Rubber-band past the trigger so the row cannot be dragged across the screen.
          dx.value =
            raw <= SWIPE_MAX ? raw : SWIPE_MAX + (raw - SWIPE_MAX) * 0.12;
        })
        .onEnd(() => {
          'worklet';
          if (dx.value >= SWIPE_TRIGGER) runOnJS(fireReplyStable)();
        })
        .onFinalize(() => {
          'worklet';
          dx.value = withSpring(0, { damping: 20, stiffness: 260 });
          runOnJS(setSwiping)(false);
        }),
    [dx, fireReplyStable],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }],
  }));

  // The arrow is MOUNTED ONLY DURING A GESTURE. Rendered always, even at zero opacity, it put
  // an Svg with two Paths in every row — about twenty extra native view trees on screen, built
  // and destroyed as fast as the list recycles, which is exactly the kind of per-cell cost
  // that was measured to wreck this scroll.
  const hintStyle = useAnimatedStyle(() => {
    const p = Math.min(1, dx.value / SWIPE_TRIGGER);
    return { opacity: p, transform: [{ scale: 0.6 + p * 0.4 }] };
  });

  // A cell is recycled into a different message while it may still be mid-spring.
  //
  // A plain effect, NOT `useAnimatedReaction`: that hook exists to watch a SHARED value from
  // the UI thread, and `id` is an ordinary javascript string, so passing it built a new UI
  // thread reaction on every render of every row — work on the one thread the gesture needs
  // free.
  useEffect(() => {
    dx.value = 0;
  }, [id, dx]);

  /**
   * A STATIC style object, not the `({ pressed }) => …` form Pressable also accepts.
   *
   * That form is a function prop, so Pressable re-renders the cell on press-in and press-out
   * and allocates a fresh style object every time — in a list, on the scroll path. The press
   * feedback it bought was an 88% opacity dip on a bubble whose only press action is a long
   * press, which is confirmed by the reply panel appearing. Memoised on what actually changes.
   */
  const bubbleStyle = useMemo(
    () => ({
      paddingHorizontal: PAD_H,
      paddingTop: PAD_TOP,
      paddingBottom: PAD_BOTTOM,
      borderRadius: R,
      // The tail replaces the corner it grows from — WhatsApp squares it.
      borderTopRightRadius: mine && firstOfRun ? 0 : R,
      borderTopLeftRadius: !mine && firstOfRun ? 0 : R,
      backgroundColor: fill,
      // An incoming bubble is a subtle fill on a near-identical ground — about 1.04:1 in light
      // and 1.06:1 in dark, far under the 3:1 WCAG 1.4.11 asks of a component boundary — so
      // without this it has no perceptible shape (VC-060). The outgoing bubble is the brand
      // fill and needs nothing.
      ...(mine ? null : { borderWidth: 1, borderColor: c.bubbleBorder }),
    }),
    [mine, firstOfRun, fill, c.bubbleBorder],
  );

  const jump = useCallback(() => {
    if (quotedId && onJumpToQuoted) onJumpToQuoted(quotedId);
  }, [quotedId, onJumpToQuoted]);

  // One label for the whole row. The ticks and the quote are decorative to a screen reader:
  // announced separately they arrive out of order and read as gibberish between messages.
  //
  // Memoised because this is a list cell: an array, a filter and a join per render per row is
  // JS the scroll pays for on every recycled cell, to produce a string that only a screen
  // reader ever reads (§R4).
  const a11yLabel = useMemo(
    () =>
      [
        quoted ? tr('chat.a11yQuoting', { author: quoted.author }) : null,
        contentPlain,
        time,
        mine ? sendStateLabel(state, tr) : null,
      ]
        .filter(Boolean)
        .join('. '),
    [quoted, contentPlain, time, mine, state, tr],
  );

  return (
    <View>
      {dateLabel ? <DateChip label={dateLabel} tint={incomingTint} /> : null}
      {/* The arrow the row slides off, revealed by the drag. Non-interactive — the gesture is
          the control; this is only its feedback. */}
      {swiping ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 16,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            },
            hintStyle,
          ]}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.quoteInIncomingBg,
            }}
          >
            <ReplyIcon size={17} color={c.incomingMeta} strokeWidth={2.2} />
          </View>
        </Animated.View>
      ) : null}

      {/* The SAME view that already carried the row's padding now carries the drag, so the
          gesture costs the cell no extra view. */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              paddingTop: topGap,
              paddingHorizontal: t.spacing.xs,
              alignItems: mine ? 'flex-end' : 'flex-start',
            },
            rowStyle,
          ]}
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

            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={a11yLabel}
              accessibilityHint={tr('chat.actionsHint')}
              style={bubbleStyle}
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
                onLongPress={openActions}
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
                style={META_ROW}
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
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const MessageBubble = React.memo(MessageBubbleBase);
