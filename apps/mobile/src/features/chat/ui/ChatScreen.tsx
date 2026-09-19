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
import { isAtBottom } from '../model/autoScroll';
import {
  compactTime,
  dayCategory,
  startsNewDay,
  startsNewRun,
} from './chat/chatModel';

/**
 * How near the end counts as "following", as a fraction of the visible window. FlashList pins
 * the list to the newest message while the reader is inside this band and leaves them alone
 * outside it — the whole follow behaviour, in one number. ~15% of the window is a little over
 * one bubble: enough that a burst cannot outrun it, small enough that someone reading history
 * is never yanked.
 */
const AUTOSCROLL_BAND = 0.15;

/**
 * The list follows the newest message BY LAYOUT, not by a scroll command.
 *
 * Three earlier attempts issued one: `scrollToOffset`, then `scrollToOffset` plus a frame, then
 * `scrollToIndex` plus a 180ms retry. All three lost the same race. FlashList re-pins the
 * viewport itself — on every data change its controller measures how far the first visible item
 * moved and cancels the shift through an invisible ScrollAnchor, and because that is a STATE
 * update it lands a render or two AFTER any callback we can scroll from. The newest bubble kept
 * ending up exactly one message below the fold, intermittently, which is the worst possible
 * shape for a bug on the app's most-used screen.
 *
 * `autoscrollToBottomThreshold` is the library's own answer and it is implemented (unlike
 * `autoscrollToTopThreshold`, which is declared in FlashListProps and never read in 2.3.2). It
 * requires the list NOT be inverted, because it pins the END of the content — so `rows` is
 * reversed into ascending order here and `loadOlder` moves from `onEndReached` to
 * `onStartReached`. `startRenderingFromBottom` opens the chat on the newest message, and
 * anchoring still holds the reader's place when older history is paged in above them.
 *
 * Hoisted so the object identity is stable; a fresh one each render re-configures the list.
 */
const FOLLOW_NEWEST = {
  startRenderingFromBottom: true,
  autoscrollToBottomThreshold: AUTOSCROLL_BAND,
  // A message you just sent should already BE at the bottom, not slide there afterwards.
  animateAutoScrollToBottom: false,
} as const;

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

/**
 * The screen the router mounts — and the one line that makes a conversation switch a switch.
 *
 * The notification deep link (`velchat://chat/:conversationId`) dispatches a NAVIGATE to `Chat`.
 * When `Chat` is ALREADY the route on top, the stack router matches it by name, keeps its key and
 * swaps `route.params`: the screen is reused, not remounted. Every hook below re-runs on the new
 * id, so the thread, the header and the presence line were always right — the screen's own state
 * was not. The composer went on holding the previous chat's words while `send` was already bound
 * to the new peer, so one tap put a private message in front of the wrong person (VC-064); the
 * scroll offset, the jump-to-latest flag and the newest-message id crossed over with it.
 *
 * A `key` is the honest way to say "this is a different conversation": React tears the old thread
 * down and builds a new one, so there is no inventory of state to keep in step — whatever
 * `ChatThread` grows later is covered by construction rather than by remembering to reset it. It
 * also re-runs the open-the-chat effects, which is what this entry point wants.
 *
 * `getId: ({ params }) => params.conversationId` on the Chat screen remounts too, but it does so
 * by PUSHING a second Chat route (StackRouter reuses a route only when the id matches), and
 * native-stack keeps every route beneath the top mounted: one live thread per notification tap,
 * each holding a DB subscription and a FlashList, on a 3 GB reference device (§R5). Worse, the
 * one popped back to would sit on screen with NO active conversation — the effect that claims it
 * keys on the id, not on focus, so it never re-runs (VC-062). Remounting inside the route leaves
 * the stack exactly as it is.
 */
export function ChatScreen(): React.JSX.Element {
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { conversationId, name } = route.params;
  return (
    <ChatThread
      key={conversationId}
      conversationId={conversationId}
      name={name}
    />
  );
}

function ChatThread({
  conversationId,
  name,
}: {
  conversationId: string;
  name: string | undefined;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
  // Mirrored in a ref so the common case — a scroll event that does not cross the threshold —
  // costs no re-render.
  const showJumpRef = useRef(false);
  const [showJump, setShowJump] = useState(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const next = !isAtBottom({
      offsetY: contentOffset.y,
      layoutHeight: layoutMeasurement.height,
      contentHeight: contentSize.height,
    });
    if (next !== showJumpRef.current) {
      showJumpRef.current = next;
      setShowJump(next);
    }
  }, []);

  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
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

  // Ascending (oldest → newest) for the list.
  //
  // `messages` is the DESC window the query returns and `rows` keeps that order, because the
  // grouping helpers above read it that way. The list needs the opposite, and reversing HERE
  // rather than in the query is what makes the grouping safe: every flag stays attached to its
  // own row, and the rendered order is identical to what the inverted list used to draw — the
  // oldest at the top, the newest at the bottom.
  const rowsAsc = useMemo(() => [...rows].reverse(), [rows]);

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
            data={rowsAsc}
            keyExtractor={m => m.id}
            renderItem={renderItem}
            getItemType={messageItemType}
            onScroll={onScroll}
            scrollEventThrottle={16}
            // See FOLLOW_NEWEST: this is the follow behaviour, and the reason the list is no
            // longer inverted.
            maintainVisibleContentPosition={FOLLOW_NEWEST}
            // Oldest-first now, so the history is at the START of the content. Without this the
            // thread simply ended at one window and nothing could ever load more.
            onStartReached={loadOlder}
            onStartReachedThreshold={0.5}
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
