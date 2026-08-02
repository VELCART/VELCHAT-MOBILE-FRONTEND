/**
 * Chat screen (§F2) — a WhatsApp-style conversation: a header with the peer, a reversed
 * FlashList of grouped message bubbles read straight from the local DB, a jump-to-latest FAB,
 * and a composer that sends OPTIMISTICALLY (writes the DB → the bubble appears instantly; the
 * MP2 outbox transmits + reconciles later). Themed with the monochrome tokens, keyboard-aware.
 * Opened from a Chats-list row.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  KeyboardAvoidingView,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
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
import { Screen } from '../../../design-system';
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
import { dayCategory, startsNewDay, startsNewRun } from './chat/chatModel';

type Msg = ReturnType<typeof useMessages>['messages'][number];

/** Show the FAB once scrolled this far from the newest message (inverted list: y≈0 = bottom). */
const JUMP_THRESHOLD = 120;

export function ChatScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { conversationId, name } = route.params;
  const { messages, meId } = useMessages(conversationId);
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

  const listRef = useRef<FlashListRef<Msg>>(null);
  const showJumpRef = useRef(false);
  const [showJump, setShowJump] = useState(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
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

  const renderItem = useCallback(
    ({ item, index }: { item: Msg; index: number }) => (
      <MessageBubble
        contentPlain={item.contentPlain ?? ''}
        mine={item.senderId === meId}
        state={item.state}
        createdAt={item.createdAt}
        clientMsgId={item.clientMsgId}
        firstOfRun={startsNewRun(messages, index)}
        dateLabel={
          startsNewDay(messages, index) ? dateLabelFor(item.createdAt) : null
        }
        onRetry={retry}
      />
    ),
    [messages, meId, retry, dateLabelFor],
  );

  return (
    <Screen edges={['top']} padded={false}>
      <ChatHeader conversationId={conversationId} name={name} onBack={onBack} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, backgroundColor: t.colors.bgBase }}>
          <FlashList
            ref={listRef}
            data={messages}
            inverted
            keyExtractor={m => m.id}
            renderItem={renderItem}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingVertical: t.spacing.xs }}
            showsVerticalScrollIndicator={false}
          />
          {showJump ? <JumpToLatest onPress={jumpToLatest} /> : null}
        </View>

        <Composer value={text} onChangeText={onChangeText} onSend={onSend} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
