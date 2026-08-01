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
import { Text, UserIcon, Screen } from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import { useConversations } from '../hooks/useConversations';

// The row type flows from the hook — the UI layer never reaches into infra directly.
type ConversationItem = ReturnType<typeof useConversations>[number];

const AVATAR = 54;

/** Compact WhatsApp-style timestamp: HH:MM today, else a short date. */
function timeLabel(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Row({
  item,
  onPress,
}: {
  item: ConversationItem;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const initial = (item.name ?? '?').trim().charAt(0).toUpperCase();
  const unread = item.unreadCount > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name ?? 'Chat'}
      onPress={onPress}
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
          backgroundColor: t.colors.bgSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {item.avatarMediaId ? (
          <Image
            source={{ uri: item.avatarMediaId }}
            style={{ width: AVATAR, height: AVATAR }}
            resizeMode="cover"
          />
        ) : initial && initial !== '?' ? (
          <Text variant="title" style={{ color: t.colors.textSecondary }}>
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
          <Text
            variant="caption"
            color="secondary"
            numberOfLines={1}
            style={{ flex: 1, fontSize: 14 }}
          >
            {item.lastMessagePreview ?? ''}
          </Text>
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
}

export function ChatsList(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const rows = useConversations();
  const renderItem = useCallback(
    ({ item }: { item: ConversationItem }) => (
      <Row
        item={item}
        onPress={() =>
          navigation.navigate('Chat', {
            conversationId: item.id,
            name: item.name,
          })
        }
      />
    ),
    [navigation],
  );

  if (rows.length === 0) {
    return (
      <Screen center>
        <Text variant="body" color="tertiary">
          {tr('common.empty')}
        </Text>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bgBase }}>
      <FlashList
        data={rows}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: t.spacing.xs }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
