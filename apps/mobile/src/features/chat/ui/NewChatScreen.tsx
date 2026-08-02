/**
 * New-chat screen (§F2, §M0) — start a DM. Lists the user's CONTACTS (user-service); tapping
 * one starts (or resumes) the DM and replaces into the Chat screen. Because the backend has no
 * inbox endpoint, this + inbound messages are the only ways a conversation enters the local
 * list. A DEV-only "start by account id" field makes it testable before contact discovery
 * lands. Own state machine per action: idle → starting → (chat | error). Theme-aware
 * (light + dark via tokens), a11y-labelled via i18n. feature-ui: no infra imports (§M3).
 */
import React, { useCallback, useState } from 'react';
import { View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import { Text, ChevronRightIcon, UserIcon } from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import { useContacts, type Contact } from '../../contacts';
import { useStartDm } from '../hooks/useStartDm';

const AVATAR = 46;

const ContactRow = React.memo(function ContactRow({
  item,
  busy,
  disabled,
  onPress,
}: {
  item: Contact;
  busy: boolean;
  disabled: boolean;
  onPress: (peerId: string, displayName: string | null) => void;
}): React.JSX.Element {
  const t = useTheme();
  const label = item.displayName ?? item.contactUserId;
  const initial = label.trim().charAt(0).toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onPress(item.contactUserId, item.displayName)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
        opacity: disabled && !busy ? 0.5 : pressed ? 0.6 : 1,
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
        {initial ? (
          <Text variant="title" style={{ color: t.colors.textSecondary }}>
            {initial}
          </Text>
        ) : (
          <UserIcon size={22} color={t.colors.textTertiary} strokeWidth={2} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={1} style={{ fontSize: 16 }}>
          {label}
        </Text>
        {item.displayName ? (
          <Text variant="caption" color="tertiary" numberOfLines={1}>
            {item.contactUserId}
          </Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={t.colors.brandFrom} />
      ) : (
        <ChevronRightIcon
          size={20}
          color={t.colors.textTertiary}
          strokeWidth={2}
        />
      )}
    </Pressable>
  );
});

export function NewChatScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { contacts, loading, error, reload } = useContacts();
  const startDm = useStartDm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [devId, setDevId] = useState('');

  const openChat = useCallback(
    async (peerId: string, displayName: string | null): Promise<void> => {
      const peer = peerId.trim();
      if (!peer || busyId) return;
      setBusyId(peer);
      setStartError(null);
      try {
        const conversationId = await startDm(peer);
        navigation.replace('Chat', {
          conversationId,
          name: displayName ?? peer,
        });
      } catch {
        // startDm surfaces network/validation failures — show a friendly, non-technical line.
        setStartError(tr('newChat.error'));
        setBusyId(null);
      }
    },
    [busyId, navigation, startDm, tr],
  );

  const renderItem = useCallback(
    ({ item }: { item: Contact }): React.JSX.Element => (
      <ContactRow
        item={item}
        busy={busyId === item.contactUserId}
        disabled={busyId !== null}
        onPress={openChat}
      />
    ),
    [busyId, openChat],
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.bgBase,
        paddingTop: insets.top,
      }}
    >
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
          {tr('newChat.title')}
        </Text>
      </View>

      {/* DEV-only: start a DM by pasting a peer account id (testable before discovery lands). */}
      {__DEV__ ? (
        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.md,
            paddingBottom: t.spacing.sm,
            gap: t.spacing.xs,
          }}
        >
          <Text variant="caption" color="tertiary">
            {tr('newChat.devTitle')}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
            }}
          >
            <TextInput
              value={devId}
              onChangeText={setDevId}
              placeholder={tr('newChat.devPlaceholder')}
              placeholderTextColor={t.colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={tr('newChat.devPlaceholder')}
              style={{
                flex: 1,
                height: 44,
                borderRadius: t.radius.lg,
                backgroundColor: t.colors.bgSubtle,
                paddingHorizontal: t.spacing.md,
                fontFamily: t.typography.body.fontFamily,
                fontSize: 15,
                color: t.colors.textPrimary,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('newChat.start')}
              disabled={!devId.trim() || busyId !== null}
              onPress={() => void openChat(devId, null)}
              style={({ pressed }) => ({
                height: 44,
                paddingHorizontal: t.spacing.lg,
                borderRadius: t.radius.pill,
                backgroundColor: t.colors.brandFrom,
                alignItems: 'center',
                justifyContent: 'center',
                opacity:
                  !devId.trim() || busyId !== null ? 0.4 : pressed ? 0.7 : 1,
              })}
            >
              <Text
                variant="label"
                style={{ color: t.colors.actionFg, fontSize: 15 }}
              >
                {tr('newChat.start')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {startError ? (
        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.xs,
          }}
        >
          <Text variant="caption" style={{ color: t.colors.danger }}>
            {startError}
          </Text>
        </View>
      ) : null}

      {/* Contacts */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <ActivityIndicator size="small" color={t.colors.brandFrom} />
            <Text
              variant="caption"
              color="tertiary"
              style={{ marginTop: t.spacing.sm }}
            >
              {tr('newChat.loading')}
            </Text>
          </View>
        ) : error ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: t.spacing.xl,
              gap: t.spacing.sm,
            }}
          >
            <Text variant="body" color="secondary" align="center">
              {tr('newChat.contactsError')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('newChat.retry')}
              onPress={reload}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text variant="label" style={{ color: t.colors.brandFrom }}>
                {tr('newChat.retry')}
              </Text>
            </Pressable>
          </View>
        ) : contacts.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: t.spacing.xl,
              gap: t.spacing.xs,
            }}
          >
            <UserIcon
              size={40}
              color={t.colors.textTertiary}
              strokeWidth={1.6}
            />
            <Text
              variant="label"
              align="center"
              style={{ marginTop: t.spacing.sm }}
            >
              {tr('newChat.empty')}
            </Text>
            <Text variant="caption" color="secondary" align="center">
              {tr('newChat.emptySub')}
            </Text>
          </View>
        ) : (
          <FlashList
            data={contacts}
            keyExtractor={c => c.contactUserId}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: t.spacing.xs }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}
