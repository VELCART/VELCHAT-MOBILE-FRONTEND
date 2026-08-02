/**
 * New-chat screen (§F2, §G2) — the WhatsApp model. Reads the phone's own address book,
 * privately matches it against the VelChat directory (OPRF, off the render path), and splits
 * contacts into "on VelChat" (tap → start/resume the DM) and "invite". Contextual permission:
 * an explainer with an Allow button precedes the OS prompt — never a wall of prompts on launch.
 *
 * Because the backend has no inbox endpoint, this + inbound messages are the only ways a
 * conversation enters the local list. A DEV-only "start by account id" field keeps it testable.
 * Own busy/error state per start action. Theme-aware (light + dark via tokens), a11y-labelled
 * via i18n. feature-ui: no infra imports (§M3) — device access flows through the hook.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  Share,
  Linking,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import {
  Text,
  ChevronRightIcon,
  SearchIcon,
  UserIcon,
} from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import {
  useDeviceContacts,
  type VelchatContact,
  type InviteContact,
} from '../../contacts';
import { useStartDm } from '../hooks/useStartDm';

const AVATAR = 48;

// ── row model (one FlashList over section headers + two contact kinds) ──────────
type Row =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'velchat'; id: string; contact: VelchatContact }
  | { kind: 'invite'; id: string; contact: InviteContact };

/** Circular avatar: photo → initial → glyph. */
function Avatar({
  name,
  thumbnailPath,
}: {
  name: string;
  thumbnailPath?: string | undefined;
}): React.JSX.Element {
  const t = useTheme();
  const initial = name.trim().charAt(0).toUpperCase();
  return (
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
      {thumbnailPath ? (
        <Image
          source={{ uri: thumbnailPath }}
          style={{ width: AVATAR, height: AVATAR }}
          resizeMode="cover"
        />
      ) : initial ? (
        <Text variant="title" style={{ color: t.colors.textSecondary }}>
          {initial}
        </Text>
      ) : (
        <UserIcon size={22} color={t.colors.textTertiary} strokeWidth={2} />
      )}
    </View>
  );
}

const SectionHeader = React.memo(function SectionHeader({
  label,
}: {
  label: string;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Text
      variant="caption"
      style={{
        paddingHorizontal: t.spacing.lg,
        paddingTop: t.spacing.md,
        paddingBottom: t.spacing.xs,
        color: t.colors.brandFrom,
        fontSize: 13,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </Text>
  );
});

const VelchatRow = React.memo(function VelchatRow({
  contact,
  busy,
  disabled,
  onPress,
}: {
  contact: VelchatContact;
  busy: boolean;
  disabled: boolean;
  onPress: (accountId: string, name: string) => void;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={contact.name}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onPress(contact.accountId, contact.name)}
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
      <Avatar name={contact.name} thumbnailPath={contact.thumbnailPath} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={1} style={{ fontSize: 16 }}>
          {contact.name}
        </Text>
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {contact.phoneE164}
        </Text>
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

const InviteRow = React.memo(function InviteRow({
  contact,
  label,
  onInvite,
}: {
  contact: InviteContact;
  label: string;
  onInvite: (contact: InviteContact) => void;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
      }}
    >
      <Avatar name={contact.name} thumbnailPath={contact.thumbnailPath} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={1} style={{ fontSize: 16 }}>
          {contact.name}
        </Text>
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {contact.phoneE164}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${contact.name}`}
        onPress={() => onInvite(contact)}
        hitSlop={8}
        style={({ pressed }) => ({
          paddingHorizontal: t.spacing.md,
          paddingVertical: 6,
          borderRadius: t.radius.pill,
          borderWidth: 1,
          borderColor: t.colors.brandFrom,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text
          variant="label"
          style={{ color: t.colors.brandFrom, fontSize: 14 }}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
});

/** Full-screen centered message with an optional action button. */
function StateView({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.spacing.xl,
        gap: t.spacing.sm,
      }}
    >
      {icon}
      <Text
        variant="title"
        align="center"
        style={{ marginTop: t.spacing.sm, fontSize: 19 }}
      >
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="secondary" align="center">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => ({
            marginTop: t.spacing.md,
            paddingHorizontal: t.spacing.xl,
            height: 46,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.brandFrom,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            variant="label"
            style={{ color: t.colors.actionFg, fontSize: 15 }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function NewChatScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, onVelchat, invitable, request, reload } = useDeviceContacts();
  const startDm = useStartDm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [devId, setDevId] = useState('');

  const openChat = useCallback(
    async (accountId: string, name: string): Promise<void> => {
      const peer = accountId.trim();
      if (!peer || busyId) return;
      setBusyId(peer);
      setStartError(null);
      try {
        const conversationId = await startDm(peer, name);
        navigation.replace('Chat', { conversationId, name });
      } catch {
        setStartError(tr('newChat.error'));
        setBusyId(null);
      }
    },
    [busyId, navigation, startDm, tr],
  );

  const onInvite = useCallback(
    (contact: InviteContact): void => {
      void Share.share({
        message: `${tr('newChat.inviteMessage')} ${contact.phoneE164}`.trim(),
      }).catch(() => undefined);
    },
    [tr],
  );

  // Filter + flatten the two sections into one recycled list.
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (name: string, phone: string): boolean =>
      q === '' || name.toLowerCase().includes(q) || phone.includes(q);
    const vel = onVelchat.filter(c => match(c.name, c.phoneE164));
    const inv = invitable.filter(c => match(c.name, c.phoneE164));
    const out: Row[] = [];
    if (vel.length > 0) {
      out.push({
        kind: 'header',
        id: 'h-vel',
        label: tr('newChat.onVelchatSection'),
      });
      for (const c of vel) out.push({ kind: 'velchat', id: c.key, contact: c });
    }
    if (inv.length > 0) {
      out.push({
        kind: 'header',
        id: 'h-inv',
        label: tr('newChat.inviteSection'),
      });
      for (const c of inv)
        out.push({ kind: 'invite', id: `i-${c.key}`, contact: c });
    }
    return out;
  }, [onVelchat, invitable, query, tr]);

  const renderItem = useCallback(
    ({ item }: { item: Row }): React.JSX.Element | null => {
      if (item.kind === 'header') return <SectionHeader label={item.label} />;
      if (item.kind === 'velchat') {
        return (
          <VelchatRow
            contact={item.contact}
            busy={busyId === item.contact.accountId}
            disabled={busyId !== null}
            onPress={openChat}
          />
        );
      }
      return (
        <InviteRow
          contact={item.contact}
          label={tr('newChat.invite')}
          onInvite={onInvite}
        />
      );
    },
    [busyId, openChat, onInvite, tr],
  );

  const body = ((): React.JSX.Element => {
    switch (status) {
      case 'checking':
      case 'loading':
        return (
          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <ActivityIndicator size="small" color={t.colors.brandFrom} />
            <Text
              variant="caption"
              color="tertiary"
              style={{ marginTop: t.spacing.sm }}
            >
              {tr('newChat.searching')}
            </Text>
          </View>
        );
      case 'needsPermission':
        return (
          <StateView
            icon={
              <UserIcon
                size={44}
                color={t.colors.textTertiary}
                strokeWidth={1.6}
              />
            }
            title={tr('newChat.allowTitle')}
            body={tr('newChat.allowBody')}
            actionLabel={tr('newChat.allowButton')}
            onAction={request}
          />
        );
      case 'blocked':
        return (
          <StateView
            title={tr('newChat.blockedTitle')}
            body={tr('newChat.blockedBody')}
            actionLabel={tr('newChat.openSettings')}
            onAction={() => void Linking.openSettings().catch(() => undefined)}
          />
        );
      case 'unavailable':
        return (
          <StateView
            title={tr('newChat.unavailableTitle')}
            body={tr('newChat.unavailableBody')}
            actionLabel={tr('newChat.retry')}
            onAction={reload}
          />
        );
      case 'error':
        return (
          <StateView
            title={tr('newChat.contactsError')}
            actionLabel={tr('newChat.retry')}
            onAction={reload}
          />
        );
      case 'ready':
      default:
        if (rows.length === 0) {
          return (
            <StateView
              icon={
                <UserIcon
                  size={44}
                  color={t.colors.textTertiary}
                  strokeWidth={1.6}
                />
              }
              title={tr('newChat.noVelchatTitle')}
              body={tr('newChat.noVelchatSub')}
            />
          );
        }
        return (
          <FlashList
            data={rows}
            keyExtractor={r => r.id}
            renderItem={renderItem}
            getItemType={r => r.kind}
            contentContainerStyle={{ paddingBottom: t.spacing.xl }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        );
    }
  })();

  const showSearch =
    status === 'ready' && (onVelchat.length > 0 || invitable.length > 0);

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
          {tr('newChat.selectContact')}
        </Text>
      </View>

      {/* Search (only once there's a list to filter). */}
      {showSearch ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            marginHorizontal: t.spacing.lg,
            marginTop: t.spacing.md,
            marginBottom: t.spacing.xs,
            paddingHorizontal: t.spacing.md,
            height: 42,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.bgSubtle,
          }}
        >
          <SearchIcon size={18} color={t.colors.textTertiary} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tr('newChat.searchPlaceholder')}
            placeholderTextColor={t.colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={tr('newChat.searchPlaceholder')}
            style={{
              flex: 1,
              fontFamily: t.typography.body.fontFamily,
              fontSize: 15,
              color: t.colors.textPrimary,
              padding: 0,
            }}
          />
        </View>
      ) : null}

      {/* DEV-only: start a DM by pasting a peer account id (testable before a real match). */}
      {__DEV__ ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.sm,
            paddingBottom: t.spacing.xs,
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
              height: 40,
              borderRadius: t.radius.lg,
              backgroundColor: t.colors.bgSubtle,
              paddingHorizontal: t.spacing.md,
              fontFamily: t.typography.body.fontFamily,
              fontSize: 14,
              color: t.colors.textPrimary,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('newChat.start')}
            disabled={!devId.trim() || busyId !== null}
            onPress={() => void openChat(devId, devId.trim())}
            style={({ pressed }) => ({
              height: 40,
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
              style={{ color: t.colors.actionFg, fontSize: 14 }}
            >
              {tr('newChat.start')}
            </Text>
          </Pressable>
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

      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}
