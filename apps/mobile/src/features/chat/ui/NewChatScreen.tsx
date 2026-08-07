/**
 * New-chat screen (§F2, §G2) — WhatsApp-parity layout with VelChat brand design.
 * Reads device contacts, privately matches via OPRF, and displays:
 * - Header with Contact Count, Animated Search mode toggle, and HeaderMenu dropdown.
 * - Action rows: New group, New contact (with QR icon), New community.
 * - Self-chat row ("Message yourself").
 * - "Contacts on VelChat" and "Invite to VelChat" sections with theme-styled avatars & actions.
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
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  Share,
  Linking,
  Animated,
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
  MoreIcon,
  UserPlusIcon,
  UsersPlusIcon,
  CommunitiesIcon,
  QrCodeIcon,
  DialpadIcon,
} from '../../../design-system';
import {
  HeaderMenu,
  type HeaderMenuItem,
} from '../../../navigation/HeaderMenu';
import type { RootStackParamList } from '../../../navigation/types';
import {
  useDeviceContacts,
  useNumberSearch,
  type VelchatContact,
  type InviteContact,
} from '../../contacts';
import { useContactAvatar } from '../../user';
import { useStartDm } from '../hooks/useStartDm';

const AVATAR = 44;

// ── row model (FlashList over actions, section headers + contact kinds) ──────────
type Row =
  | {
      kind: 'action';
      id: string;
      actionKind: 'new_group' | 'new_contact' | 'new_community';
    }
  | { kind: 'header'; id: string; label: string }
  | { kind: 'self'; id: string }
  | { kind: 'velchat'; id: string; contact: VelchatContact }
  | { kind: 'invite'; id: string; contact: InviteContact }
  | { kind: 'lookup'; id: string; contact: InviteContact };

// A stable, cheerful colour per contact (WhatsApp-style) so a no-photo avatar is a coloured
// initial, not a grey blob. Same name → same colour across renders.
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
    // eslint-disable-next-line no-bitwise
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? '#7C3AED';
}

/**
 * Circular avatar. `plain` (an invite / not-on-VelChat contact) is just a simple person glyph.
 * Otherwise: saved photo → coloured initial → person glyph.
 */
function Avatar({
  name,
  thumbnailPath,
  plain,
}: {
  name: string;
  thumbnailPath?: string | undefined;
  plain?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  const initial = name.trim().charAt(0).toUpperCase();
  const base = {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  } as const;

  if (!plain && thumbnailPath) {
    return (
      <View style={{ ...base, backgroundColor: t.colors.bgSubtle }}>
        <Image
          source={{ uri: thumbnailPath }}
          style={{ width: AVATAR, height: AVATAR }}
          resizeMode="cover"
        />
      </View>
    );
  }
  if (plain || !initial) {
    return (
      <View style={{ ...base, backgroundColor: t.colors.bgSubtle }}>
        <UserIcon size={22} color={t.colors.textTertiary} strokeWidth={2} />
      </View>
    );
  }
  return (
    <View style={{ ...base, backgroundColor: avatarColor(name) }}>
      <Text variant="title" style={{ color: '#fff', fontSize: 18 }}>
        {initial}
      </Text>
    </View>
  );
}

const ActionRow = React.memo(function ActionRowView({
  actionKind,
  onPress,
}: {
  actionKind: 'new_group' | 'new_contact' | 'new_community';
  onPress?: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();

  const config = {
    new_group: {
      label: tr('newChat.newGroup'),
      icon: (
        <UsersPlusIcon size={22} color={t.colors.actionFg} strokeWidth={2} />
      ),
      showQr: false,
    },
    new_contact: {
      label: tr('newChat.newContact'),
      icon: (
        <UserPlusIcon size={22} color={t.colors.actionFg} strokeWidth={2} />
      ),
      showQr: true,
    },
    new_community: {
      label: tr('newChat.newCommunity'),
      icon: (
        <CommunitiesIcon size={22} color={t.colors.actionFg} strokeWidth={2} />
      ),
      showQr: false,
    },
  }[actionKind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={config.label}
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
          backgroundColor: t.colors.brandFrom,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {config.icon}
      </View>
      <Text
        variant="body"
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 16,
          fontFamily: t.typography.label.fontFamily,
          color: t.colors.textPrimary,
        }}
      >
        {config.label}
      </Text>
      {config.showQr ? (
        <QrCodeIcon
          size={22}
          color={t.colors.textSecondary}
          strokeWidth={1.8}
        />
      ) : null}
    </Pressable>
  );
});

const SelfRow = React.memo(function SelfRowView({
  selfId,
  busy,
  disabled,
  onPress,
}: {
  selfId: string;
  busy: boolean;
  disabled: boolean;
  onPress: (accountId: string, name: string) => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const selfDp = useContactAvatar(selfId);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('newChat.messageYourself')}
      disabled={disabled}
      onPress={() => onPress(selfId, tr('newChat.messageYourself'))}
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
          backgroundColor: t.colors.brandFrom,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {selfDp ? (
          <Image
            source={{ uri: selfDp }}
            style={{ width: AVATAR, height: AVATAR }}
            resizeMode="cover"
          />
        ) : (
          <UserIcon size={22} color={t.colors.actionFg} strokeWidth={2.2} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={1} style={{ fontSize: 16 }}>
          {tr('newChat.messageYourself')}
        </Text>
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {tr('newChat.noteToSelf')}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={t.colors.brandFrom} />
      ) : null}
    </Pressable>
  );
});

const SectionHeader = React.memo(function SectionHeaderView({
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
        color: t.colors.textSecondary,
        fontSize: 13,
        fontFamily: t.typography.label.fontFamily,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </Text>
  );
});

const VelchatRow = React.memo(function VelchatRowView({
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
  const dp = useContactAvatar(contact.accountId);
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
      <Avatar name={contact.name} thumbnailPath={dp ?? contact.thumbnailPath} />
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

const InviteRow = React.memo(function InviteRowView({
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
      <Avatar name={contact.name} plain />
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
          paddingHorizontal: t.spacing.sm,
          paddingVertical: 4,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text
          variant="label"
          style={{
            color: t.colors.success,
            fontSize: 14,
            fontFamily: t.typography.label.fontFamily,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
});

const LookupRow = React.memo(function LookupRowView({
  e164,
  name,
  thumbnailPath,
  disabled,
  lookup,
  onFound,
  onInvite,
}: {
  e164: string;
  name?: string | undefined;
  thumbnailPath?: string | undefined;
  disabled: boolean;
  lookup: (e164: string) => Promise<string | null>;
  onFound: (accountId: string, name: string) => void;
  onInvite: (e164: string) => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [state, setState] = useState<'idle' | 'searching' | 'notfound'>('idle');
  useEffect(() => setState('idle'), [e164]);

  const onPress = useCallback(async (): Promise<void> => {
    if (state === 'searching' || disabled) return;
    setState('searching');
    try {
      const acc = await lookup(e164);
      if (acc) onFound(acc, name ?? e164);
      else setState('notfound');
    } catch {
      setState('notfound');
    }
  }, [state, disabled, lookup, e164, name, onFound]);

  const title = name ?? e164;
  const subtitle =
    state === 'notfound'
      ? tr('newChat.numberNotFound')
      : name
        ? e164
        : tr('newChat.numberSearchHint');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tr('newChat.numberSearchHint')}: ${title}`}
      disabled={state === 'notfound'}
      onPress={() => {
        void onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
        backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
      })}
    >
      {name ? (
        <Avatar name={name} thumbnailPath={thumbnailPath} />
      ) : (
        <View
          style={{
            width: AVATAR,
            height: AVATAR,
            borderRadius: AVATAR / 2,
            backgroundColor: t.colors.brandFrom,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SearchIcon size={22} color={t.colors.actionFg} strokeWidth={2.2} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={1} style={{ fontSize: 16 }}>
          {title}
        </Text>
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {state === 'searching' ? (
        <ActivityIndicator size="small" color={t.colors.brandFrom} />
      ) : state === 'notfound' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${tr('newChat.invite')}: ${title}`}
          onPress={() => onInvite(e164)}
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
            {tr('newChat.invite')}
          </Text>
        </Pressable>
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
  const {
    status,
    onVelchat,
    invitable,
    discoveryFailed,
    self,
    request,
    reload,
  } = useDeviceContacts();
  const startDm = useStartDm();
  const { normalize, lookup } = useNumberSearch();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  // Smooth, fast animation when opening / closing header search
  const searchAnim = useRef(new Animated.Value(0)).current;

  const toggleSearch = useCallback(
    (open: boolean): void => {
      if (open) {
        setIsSearching(true);
        Animated.timing(searchAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(searchAnim, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            setIsSearching(false);
            setQuery('');
          }
        });
      }
    },
    [searchAnim],
  );

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

  const shareInvite = useCallback(
    (phone: string): void => {
      void Share.share({
        message: `${tr('newChat.inviteMessage')} ${phone}`.trim(),
      }).catch(() => undefined);
    },
    [tr],
  );

  const onInvite = useCallback(
    (contact: InviteContact): void => shareInvite(contact.phoneE164),
    [shareInvite],
  );

  const menuItems: HeaderMenuItem[] = useMemo(
    () => [
      {
        label: tr('newChat.menuContactSettings'),
        onPress: () => navigation.navigate('Settings'),
      },
      {
        label: tr('newChat.menuInviteFriend'),
        onPress: () => shareInvite(''),
      },
      {
        label: tr('newChat.menuContacts'),
        onPress: () => {},
      },
      {
        label: tr('newChat.menuRefresh'),
        onPress: () => reload(),
      },
      {
        label: tr('newChat.menuHelp'),
        onPress: () => {},
      },
    ],
    [navigation, reload, shareInvite, tr],
  );

  const totalContactsCount = useMemo(
    () => onVelchat.length + invitable.length,
    [onVelchat.length, invitable.length],
  );

  const matchedNumbers = useMemo(
    () => new Set(onVelchat.map(c => c.phoneE164)),
    [onVelchat],
  );

  const candidate = useMemo(() => {
    const c = normalize(query);
    return c && !matchedNumbers.has(c) ? c : null;
  }, [normalize, query, matchedNumbers]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (name: string, phone: string): boolean =>
      q === '' || name.toLowerCase().includes(q) || phone.includes(q);

    const out: Row[] = [];

    // Always add WhatsApp action rows at top when not searching or matching query
    if (
      !q ||
      'new group'.includes(q) ||
      'new contact'.includes(q) ||
      'new community'.includes(q)
    ) {
      out.push({ kind: 'action', id: 'act-group', actionKind: 'new_group' });
      out.push({
        kind: 'action',
        id: 'act-contact',
        actionKind: 'new_contact',
      });
      out.push({
        kind: 'action',
        id: 'act-community',
        actionKind: 'new_community',
      });
    }

    if (discoveryFailed) {
      const all = invitable.filter(c => match(c.name, c.phoneE164));
      if (all.length > 0) {
        out.push({
          kind: 'header',
          id: 'h-contacts',
          label: tr('newChat.contactsSection'),
        });
        for (const c of all)
          out.push({ kind: 'lookup', id: `l-${c.key}`, contact: c });
      }
      return out;
    }

    const vel = onVelchat.filter(c => match(c.name, c.phoneE164));
    const inv = invitable.filter(c => match(c.name, c.phoneE164));

    if (vel.length > 0 || (self && !q)) {
      out.push({
        kind: 'header',
        id: 'h-vel',
        label: tr('newChat.onVelchatSection'),
      });
      if (self && !q) {
        out.push({ kind: 'self', id: `self-${self}` });
      }
      for (const c of vel) {
        out.push({ kind: 'velchat', id: c.key, contact: c });
      }
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
  }, [onVelchat, invitable, discoveryFailed, query, self, tr]);

  const renderItem = useCallback(
    ({ item }: { item: Row }): React.JSX.Element | null => {
      if (item.kind === 'action') {
        return (
          <ActionRow
            actionKind={item.actionKind}
            onPress={() => {
              if (item.actionKind === 'new_community') {
                navigation.navigate('AppTabs');
              }
            }}
          />
        );
      }
      if (item.kind === 'header') return <SectionHeader label={item.label} />;
      if (item.kind === 'self') {
        return (
          <SelfRow
            selfId={item.id.replace('self-', '')}
            busy={busyId === self}
            disabled={busyId !== null}
            onPress={(acc, name) => {
              void openChat(acc, name);
            }}
          />
        );
      }
      if (item.kind === 'velchat') {
        return (
          <VelchatRow
            contact={item.contact}
            busy={busyId === item.contact.accountId}
            disabled={busyId !== null}
            onPress={(acc, name) => {
              void openChat(acc, name);
            }}
          />
        );
      }
      if (item.kind === 'lookup') {
        return (
          <LookupRow
            e164={item.contact.phoneE164}
            name={item.contact.name}
            thumbnailPath={item.contact.thumbnailPath}
            disabled={busyId !== null}
            lookup={lookup}
            onFound={(acc, name) => {
              void openChat(acc, name);
            }}
            onInvite={shareInvite}
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
    [busyId, self, openChat, onInvite, shareInvite, lookup, navigation, tr],
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
      case 'ready':
      default:
        if (rows.length === 0) {
          if (candidate) return <View style={{ flex: 1 }} />;
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

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.bgBase,
        paddingTop: insets.top,
      }}
    >
      {/* Official WhatsApp-Style Header Menu Dropdown */}
      <HeaderMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
      />

      {/* Top Header / Animated Search Bar */}
      {isSearching ? (
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
            height: 56,
            paddingHorizontal: t.spacing.xs,
            borderBottomWidth: 1,
            borderBottomColor: t.colors.hairline,
            opacity: searchAnim,
            transform: [
              {
                translateX: searchAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('profile.back')}
            onPress={() => toggleSearch(false)}
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
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tr('newChat.searchPlaceholderHeader')}
            placeholderTextColor={t.colors.textTertiary}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={tr('newChat.searchPlaceholderHeader')}
            style={{
              flex: 1,
              fontFamily: t.typography.body.fontFamily,
              fontSize: 16,
              color: t.colors.textPrimary,
              padding: 0,
            }}
          />
          <Pressable
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <DialpadIcon size={20} color={t.colors.textSecondary} />
          </Pressable>
        </Animated.View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
            height: 56,
            paddingLeft: t.spacing.xs,
            paddingRight: t.spacing.xs,
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

          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text
              variant="title"
              numberOfLines={1}
              style={{ fontSize: 18, lineHeight: 22 }}
            >
              {tr('newChat.selectContact')}
            </Text>
            <Text
              variant="caption"
              color="tertiary"
              numberOfLines={1}
              style={{ fontSize: 12 }}
            >
              {tr('newChat.contactsCount', { count: totalContactsCount })}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('newChat.searchPlaceholder')}
            onPress={() => toggleSearch(true)}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <SearchIcon
              size={22}
              color={t.colors.textPrimary}
              strokeWidth={2}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Menu"
            onPress={() => setMenuVisible(true)}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <MoreIcon size={22} color={t.colors.textPrimary} />
          </Pressable>
        </View>
      )}

      {/* Lookup non-contact search hit */}
      {candidate ? (
        <LookupRow
          e164={candidate}
          disabled={busyId !== null}
          lookup={lookup}
          onFound={(acc, name) => {
            void openChat(acc, name);
          }}
          onInvite={shareInvite}
        />
      ) : null}

      {/* Discovery offline banner */}
      {status === 'ready' && discoveryFailed && rows.length > 0 ? (
        <Text
          variant="caption"
          color="tertiary"
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.xs,
          }}
        >
          {tr('newChat.discoveryOffline')}
        </Text>
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
