/**
 * Chat screen (§F2) — a WhatsApp-style conversation: a header with the peer, a reversed
 * FlashList of grouped message bubbles read straight from the local DB, a jump-to-latest FAB,
 * and a composer that sends OPTIMISTICALLY (writes the DB → the bubble appears instantly; the
 * MP2 outbox transmits + reconciles later). Themed with the monochrome tokens, keyboard-aware.
 * Opened from a Chats-list row.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Keyboard,
  Platform,
  type EmitterSubscription,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewStyle,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import { Screen, spacing } from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import {
  useMessages,
  useSendMessage,
  useRetrySend,
} from '../hooks/useMessages';
import { useTyping } from '../hooks/useTyping';
import { ChatHeader } from './chat/ChatHeader';
import { Composer } from './chat/Composer';
import { JumpToLatest } from './chat/JumpToLatest';
import { MessageBubble } from './chat/MessageBubble';
import { ChatWallpaper } from './chat/ChatWallpaper';
import { WallpaperSheet } from './chat/WallpaperSheet';
import { setChatWallpaper } from '../api/setChatWallpaper';
import { useConversationIdentity } from '../hooks/useConversationIdentity';
import { wallpaperPaint, type WallpaperId } from '../model/wallpaper';
import { shouldScrollToLatest } from '../model/autoScroll';
import {
  compactTime,
  dayCategory,
  startsNewDay,
  startsNewRun,
} from './chat/chatModel';

/** Show the FAB once scrolled this far from the newest message (inverted list: y≈0 = bottom). */
const JUMP_THRESHOLD = 120;

/** How long FlashList's scroll-anchor correction takes to settle before the follow is re-issued. */
const FOLLOW_SETTLE_MS = 180;

// Hoisted: an inline literal is a fresh prop identity on every render. Same value as before
// (`spacing` is the static token the theme carries), so the rendered padding is unchanged.
const LIST_CONTENT_STYLE: ViewStyle = { paddingVertical: spacing.xs };

/**
 * A message as the list renders it: grouping decisions and ICU labels resolved ONCE per DB
 * emission, not per row per render. Doing it inline made `renderItem` depend on `messages`,
 * so every emission handed every mounted cell a new callback identity (full re-render of the
 * visible window) and re-ran `startsNewRun`/`startsNewDay` — up to 4 `Date` allocations per
 * row, every time (§R4).
 */
interface MessageRow {
  readonly id: string;
  readonly clientMsgId: string;
  readonly contentPlain: string;
  readonly mine: boolean;
  readonly state: string;
  readonly time: string;
  readonly firstOfRun: boolean;
  readonly dateLabel: string | null;
}

/** Mine/theirs bubbles are structurally different — they must not share a recycle pool. */
function messageItemType(item: MessageRow): string {
  return item.mine ? 'mine' : 'theirs';
}

export function ChatScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { conversationId, name } = route.params;
  // The header observes this row too; one extra subscription to a single row is cheaper than
  // threading the value down through the header's props.
  const { wallpaper } = useConversationIdentity(conversationId);
  const paint = wallpaperPaint(wallpaper, t.scheme);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const openWallpaper = useCallback(() => setWallpaperOpen(true), []);
  const closeWallpaper = useCallback(() => setWallpaperOpen(false), []);
  // Write it straight to the row; the identity subscription above re-renders the thread, so
  // the new ground is on screen before the sheet has finished closing.
  const pickWallpaper = useCallback(
    (id: WallpaperId) => {
      void setChatWallpaper(conversationId, id).catch(() => undefined);
    },
    [conversationId],
  );
  const { messages, meId, loadOlder } = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const retry = useRetrySend();
  const { notifyTyping, stopTyping } = useTyping(conversationId);
  const [text, setText] = useState('');

  // Feed each keystroke to the throttled typing signal (§C4) alongside the local text state.
  const onChangeText = useCallback(
    (v: string) => {
      setText(v);
      notifyTyping(v);
    },
    [notifyTyping],
  );

  // Stable "now" for date-separator classification — it must not shift each render (that
  // would rebuild every chip label) and needn't track the midnight rollover mid-session.
  const now = useMemo(() => Date.now(), []);

  const listRef = useRef<FlashListRef<MessageRow>>(null);
  const showJumpRef = useRef(false);
  const [showJump, setShowJump] = useState(false);

  // Live scroll offset, kept in a ref so tracking it costs no re-render. The auto-follow below
  // needs to know whether the user is at the bottom at the MOMENT a message lands.
  const offsetRef = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
    const next = e.nativeEvent.contentOffset.y > JUMP_THRESHOLD;
    if (next !== showJumpRef.current) {
      showJumpRef.current = next;
      setShowJump(next);
    }
  }, []);

  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);

  // Keep the composer above the keyboard. KeyboardAvoidingView is unreliable under RN 0.86's
  // Android edge-to-edge (the input hid behind the keyboard); the app's proven pattern is a
  // manual keyboard-height listener (see BottomSheet) — lift the pane by the keyboard height.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show: EmitterSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => setKbHeight(e.endCoordinates?.height ?? 0),
    );
    const hide: EmitterSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const onSend = useCallback(() => {
    if (!text.trim()) return;
    send(text);
    setText('');
    stopTyping();
  }, [text, send, stopTyping]);

  const dateLabelFor = useCallback(
    (ts: number): string => {
      const cat = dayCategory(ts, now);
      if (cat === 'today') return tr('chat.today');
      if (cat === 'yesterday') return tr('chat.yesterday');
      return new Date(ts).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      });
    },
    [now, tr],
  );

  // One grouping pass per emission (the window is bounded — `observeMessages` takes 50).
  const rows = useMemo<MessageRow[]>(
    () =>
      messages.map((m, i) => ({
        id: m.id,
        clientMsgId: m.clientMsgId,
        contentPlain: m.contentPlain ?? '',
        mine: m.senderId === meId,
        state: m.state,
        time: compactTime(m.createdAt),
        firstOfRun: startsNewRun(messages, i),
        dateLabel: startsNewDay(messages, i) ? dateLabelFor(m.createdAt) : null,
      })),
    [messages, meId, dateLabelFor],
  );

  // Follow the newest message.
  //
  // The list is inverted, so new rows grow the content underneath the viewport and nothing
  // pulled it back — a message, including one the user had just typed, landed below the fold
  // and had to be scrolled to by hand. `rows[0]` is the newest (the query is created_at DESC).
  // A reader who has scrolled up into history is deliberately left alone and keeps the
  // jump-to-latest button instead; see `shouldScrollToLatest`.
  //
  // Deciding to follow is not enough, and this is what VC-052 was: FlashList v2 turns
  // `maintainVisibleContentPosition` ON BY DEFAULT (`minIndexForVisible: 0`). `inverted` is only
  // a scaleY(-1) transform, so a new message is inserted at internal index 0 — the scroll START —
  // and the native anchor PINS the viewport, pushing the offset out by exactly the height of the
  // new bubbles. A `scrollToOffset` issued in this commit is therefore undone by the anchor
  // adjustment that lands after it, which is why the new message sat clipped behind the composer.
  // The library's own follow knob cannot help: `autoscrollToBottomThreshold` defaults to disabled
  // and targets the internal END (the OLDEST rows here), and `autoscrollToTopThreshold` is
  // declared in FlashListProps but never read anywhere in 2.3.2.
  //
  // So the decision is recorded here and the scroll is issued from `onContentSizeChange`, which
  // fires AFTER the new rows are laid out and the anchor has had its say. Anchoring is kept,
  // because it is exactly what should happen to a reader scrolled up in history.
  const newestIdRef = useRef<string | undefined>(undefined);
  const followPendingRef = useRef(false);
  useEffect(() => {
    const newest = rows[0];
    if (!newest) return;
    const previous = newestIdRef.current;
    newestIdRef.current = newest.id;
    // First emission just records where we are — opening a chat already starts at the bottom.
    if (previous === undefined || previous === newest.id) return;
    if (
      shouldScrollToLatest({ own: newest.mine, offsetY: offsetRef.current })
    ) {
      followPendingRef.current = true;
    }
  }, [rows]);

  // `scrollToIndex`, NOT `scrollToOffset`, and fired from the size callback rather than the
  // data effect. Both details are load-bearing:
  //
  //  - FlashList re-pins the viewport itself. On every data change its controller measures how
  //    far the FIRST VISIBLE item moved and calls `scrollAnchorRef.scrollBy(diff)` to cancel the
  //    shift, gated on a `pauseOffsetCorrection` flag. `scrollToOffset` does not touch that flag,
  //    so a plain offset scroll is simply undone — which is why the thread kept landing exactly
  //    one bubble short of the newest message. `scrollToIndex` RAISES the flag for the whole
  //    scroll (and 300ms after it settles) and re-targets if the layout moves under it, so it is
  //    the only scroll command that wins against the correction.
  //  - `onContentSizeChange` fires once the new rows are actually laid out, so index 0 has a real
  //    layout to scroll to instead of the stale one it would have in the same commit.
  //
  // Twice, ~180ms apart. FlashList's correction does not move the scroll directly: it nudges an
  // invisible ScrollAnchor, which is a STATE update, so the shift lands a render or two after
  // this callback. One scroll here is enough on an emulator and loses the race on a real
  // device — measured on a CPH2643, where the newest bubbles kept landing below the fold while
  // the same build followed correctly on the emulator. The retry runs after the anchor has
  // settled; if the first scroll already won, scrolling to index 0 again is a no-op.
  const followTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearFollowTimer = useCallback(() => {
    if (followTimerRef.current !== null) {
      clearTimeout(followTimerRef.current);
      followTimerRef.current = null;
    }
  }, []);
  // §M7: the timer is owned and released, so a scroll can never be delivered to a list that is gone.
  useEffect(() => clearFollowTimer, [clearFollowTimer]);

  const onContentSizeChange = useCallback(() => {
    if (!followPendingRef.current) return;
    followPendingRef.current = false;
    listRef.current?.scrollToIndex({ index: 0, animated: true });
    clearFollowTimer();
    followTimerRef.current = setTimeout(() => {
      followTimerRef.current = null;
      listRef.current?.scrollToIndex({ index: 0, animated: true });
    }, FOLLOW_SETTLE_MS);
  }, [clearFollowTimer]);

  // A pending follow belongs to the message that triggered it, not to the next content change.
  // If the user takes hold of the list first, drop it — and `loadOlder` growing the content must
  // never be mistaken for a new message arriving.
  const onScrollBeginDrag = useCallback(() => {
    followPendingRef.current = false;
    clearFollowTimer();
  }, [clearFollowTimer]);

  // Depends only on stable references, so a new emission no longer re-renders every cell.
  // The two wallpaper values are plain strings off a memoised paint, so they don't churn.
  const renderItem = useCallback(
    ({ item }: { item: MessageRow }) => (
      <MessageBubble
        contentPlain={item.contentPlain}
        mine={item.mine}
        state={item.state}
        time={item.time}
        clientMsgId={item.clientMsgId}
        firstOfRun={item.firstOfRun}
        dateLabel={item.dateLabel}
        onRetry={retry}
        incomingTint={paint.incomingTint}
        incomingBorder={paint.incomingBorder}
      />
    ),
    [retry, paint.incomingTint, paint.incomingBorder],
  );

  return (
    <Screen edges={['top']} padded={false}>
      <ChatHeader
        conversationId={conversationId}
        name={name}
        onBack={onBack}
        onOpenWallpaper={openWallpaper}
      />
      <WallpaperSheet
        visible={wallpaperOpen}
        current={wallpaper}
        onClose={closeWallpaper}
        onPick={pickWallpaper}
      />

      <View style={{ flex: 1, paddingBottom: kbHeight }}>
        <View style={{ flex: 1, backgroundColor: t.colors.bgBase }}>
          {/* Behind the list and outside it, so scrolling never repaints the wallpaper. */}
          <ChatWallpaper id={wallpaper} />
          <FlashList
            ref={listRef}
            data={rows}
            inverted
            keyExtractor={m => m.id}
            renderItem={renderItem}
            getItemType={messageItemType}
            onScroll={onScroll}
            onScrollBeginDrag={onScrollBeginDrag}
            onContentSizeChange={onContentSizeChange}
            scrollEventThrottle={16}
            // Inverted list: the "end" is the TOP, i.e. the oldest bubble on screen. Without this
            // the history simply stopped at one window and nothing could ever load more.
            onEndReached={loadOlder}
            onEndReachedThreshold={0.5}
            contentContainerStyle={LIST_CONTENT_STYLE}
            showsVerticalScrollIndicator={false}
          />
          {showJump ? <JumpToLatest onPress={jumpToLatest} /> : null}
        </View>

        <Composer
          value={text}
          onChangeText={onChangeText}
          onSend={onSend}
          keyboardUp={kbHeight > 0}
        />
      </View>
    </Screen>
  );
}
