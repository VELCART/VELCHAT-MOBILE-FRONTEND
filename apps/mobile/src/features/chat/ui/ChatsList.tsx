/**
 * Chats list (§F2) — WhatsApp-style rows on a FlashList (recycled, 55+ FPS on the ref
 * device, §R4), reading straight from WatermelonDB via `useConversations`. Pinned float
 * to the top, then most-recent; unread count as a brand pill. Instant open (DB-backed).
 */
import React, { useCallback } from 'react';
import { View, Pressable, Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import { Text, UserIcon, ChatIcon, ChatPlusIcon } from '../../../design-system';
import { useTypingUser } from '../../../core';
import { useContactAvatar } from '../../user';
import type { RootStackParamList } from '../../../navigation/types';
import { useConversations } from '../hooks/useConversations';
import { useConversationPeer } from '../hooks/useConversationPeer';

// The row type flows from the hook — the UI layer never reaches into infra directly.
type ConversationItem = ReturnType<typeof useConversations>[number];

const AVATAR = 54;

// Cheerful, stable per-name colour so a no-photo avatar is a coloured initial (WhatsApp-style).
const AVATAR_COLORS = [
  '#7C3AED',
  '#DB2777',
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#0891B2',
  '#9333EA',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1)
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? '#7C3AED';
}

/** Compact WhatsApp-style timestamp: HH:MM today, else a short date. */
function timeLabel(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Memoised so a message arriving in ANY conversation (which re-emits the whole list)
// only re-renders rows whose own fields changed — not every visible row. `onOpen` is a
// stable handler from the parent, so prop identity holds across list re-emits.
const Row = React.memo(function Row({
  item,
  onOpen,
}: {
  item: ConversationItem;
  onOpen: (id: string, name?: string) => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const initial = (item.name ?? '?').trim().charAt(0).toUpperCase();
  const unread = item.unreadCount > 0;
  // Typing wins over the last-message preview for this conversation (§C4, ephemeral store).
  const typing = useTypingUser(item.id) !== null;
  // The other user's VelChat profile photo (DMs only), cached — else a colourful initial.
  const peer = useConversationPeer(item.type === 'dm' ? item.id : undefined);
  const dp = useContactAvatar(peer);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name ?? 'Chat'}
      onPress={() => onOpen(item.id, item.name)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
        backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
      })}
    >
      <View
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: AVATAR / 2,
          backgroundColor:
            initial && initial !== '?'
              ? avatarColor(item.name ?? '')
              : t.colors.bgSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {dp ? (
          <Image
            source={{ uri: dp }}
            style={{ width: AVATAR, height: AVATAR }}
            resizeMode="cover"
          />
        ) : initial && initial !== '?' ? (
          <Text variant="title" style={{ color: '#fff' }}>
            {initial}
          </Text>
        ) : (
          <UserIcon size={26} color={t.colors.textTertiary} strokeWidth={2} />
        )}
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            variant="body"
            numberOfLines={1}
            style={{ flex: 1, fontSize: 17, color: t.colors.textPrimary }}
          >
            {item.name ?? '—'}
          </Text>
          <Text
            variant="caption"
            style={{
              color: unread ? t.colors.brandFrom : t.colors.textTertiary,
            }}
          >
            {timeLabel(item.lastMessageAt)}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
          }}
        >
          {typing ? (
            <Text
              variant="caption"
              numberOfLines={1}
              style={{ flex: 1, fontSize: 14, color: t.colors.brandFrom }}
            >
              {tr('chat.typing')}
            </Text>
          ) : (
            <Text
              variant="caption"
              color="secondary"
              numberOfLines={1}
              style={{ flex: 1, fontSize: 14 }}
            >
              {item.lastMessagePreview ?? ''}
            </Text>
          )}
          {unread ? (
            <View
              style={{
                minWidth: 20,
                height: 20,
                paddingHorizontal: 6,
                borderRadius: 10,
                backgroundColor: t.colors.brandFrom,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                variant="caption"
                style={{ color: t.colors.actionFg, fontSize: 12 }}
              >
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

export function ChatsList(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const rows = useConversations();
  const onOpen = useCallback(
    (id: string, name?: string) => {
      navigation.navigate('Chat', { conversationId: id, name });
    },
    [navigation],
  );
  const openNewChat = useCallback(() => {
    navigation.navigate('NewChat');
  }, [navigation]);
  const renderItem = useCallback(
    ({ item }: { item: ConversationItem }) => (
      <Row item={item} onOpen={onOpen} />
    ),
    [onOpen],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bgBase }}>
      {rows.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: t.spacing.xl,
            gap: t.spacing.xs,
          }}
        >
          <ChatIcon size={44} color={t.colors.textTertiary} strokeWidth={1.6} />
          <Text
            variant="title"
            align="center"
            style={{ marginTop: t.spacing.sm, fontSize: 19 }}
          >
            {tr('chat.emptyTitle')}
          </Text>
          <Text variant="body" color="tertiary" align="center">
            {tr('chat.emptySub')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: t.spacing.xs }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Compose FAB — the entry point to start a new chat (§F2). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('chat.newChat')}
        onPress={openNewChat}
        style={({ pressed }) => ({
          position: 'absolute',
          right: t.spacing.lg,
          bottom: t.spacing.xl,
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: t.colors.brandFrom,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        })}
      >
        <ChatPlusIcon size={24} color={t.colors.actionFg} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
