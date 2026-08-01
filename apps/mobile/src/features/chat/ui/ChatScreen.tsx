/**
 * Chat screen (§F2) — a conversation: reversed FlashList of message bubbles (mine right /
 * theirs left) reading the local DB, and a composer that sends OPTIMISTICALLY (writes the
 * DB → the bubble appears instantly; the MP2 outbox transmits + reconciles later). Themed,
 * keyboard-aware. Opened from a Chats-list row.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import { Screen, Text, ChevronRightIcon } from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import { useMessages, useSendMessage } from '../hooks/useMessages';

type Msg = ReturnType<typeof useMessages>['messages'][number];

function timeLabel(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Bubble({
  item,
  mine,
}: {
  item: Msg;
  mine: boolean;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: t.spacing.md,
        paddingVertical: t.spacing.xxs,
        alignItems: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <View
        style={{
          maxWidth: '82%',
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.xs + 1,
          borderRadius: t.radius.lg,
          borderBottomRightRadius: mine ? 4 : t.radius.lg,
          borderBottomLeftRadius: mine ? t.radius.lg : 4,
          backgroundColor: mine ? t.colors.brandFrom : t.colors.bgSubtle,
        }}
      >
        <Text
          variant="body"
          style={{ color: mine ? t.colors.actionFg : t.colors.textPrimary }}
        >
          {item.contentPlain ?? ''}
        </Text>
        <Text
          variant="caption"
          style={{
            alignSelf: 'flex-end',
            marginTop: 2,
            fontSize: 11,
            color: mine ? t.colors.actionFg : t.colors.textTertiary,
            opacity: mine ? 0.75 : 1,
          }}
        >
          {timeLabel(item.createdAt)}
          {mine ? (item.state === 'read' ? ' ✓✓' : ' ✓') : ''}
        </Text>
      </View>
    </View>
  );
}

export function ChatScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { conversationId, name } = route.params;
  const { messages, meId } = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const [text, setText] = useState('');

  const onSend = useCallback(() => {
    if (!text.trim()) return;
    send(text);
    setText('');
  }, [text, send]);

  const renderItem = useCallback(
    ({ item }: { item: Msg }) => (
      <Bubble item={item} mine={item.senderId === meId} />
    ),
    [meId],
  );

  return (
    <Screen edges={['top']} padded={false}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.xs,
          height: 56,
          paddingLeft: t.spacing.xs,
          paddingRight: t.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.hairline,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('profile.back')}
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <ChevronRightIcon
              size={26}
              color={t.colors.textPrimary}
              strokeWidth={2.2}
            />
          </View>
        </Pressable>
        <Text
          variant="title"
          numberOfLines={1}
          style={{ fontSize: 18, flex: 1 }}
        >
          {name ?? tr('tabs.chats')}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1 }}>
          <FlashList
            data={messages}
            inverted
            keyExtractor={m => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: t.spacing.sm }}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Composer */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: t.colors.hairline,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={tr('chat.messagePlaceholder')}
            placeholderTextColor={t.colors.textTertiary}
            multiline
            style={{
              flex: 1,
              maxHeight: 120,
              minHeight: 42,
              borderRadius: t.radius.lg,
              backgroundColor: t.colors.bgSubtle,
              paddingHorizontal: t.spacing.md,
              paddingTop: 10,
              paddingBottom: 10,
              fontFamily: t.typography.body.fontFamily,
              fontSize: 16,
              color: t.colors.textPrimary,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('chat.send')}
            onPress={onSend}
            disabled={!text.trim()}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: t.colors.brandFrom,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !text.trim() ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Text
              variant="label"
              style={{ color: t.colors.actionFg, fontSize: 18 }}
            >
              ↑
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
