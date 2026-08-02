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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  useNumberSearch,
  type VelchatContact,
  type InviteContact,
} from '../../contacts';
import { useStartDm } from '../hooks/useStartDm';

const AVATAR = 48;

// ── row model (one FlashList over section headers + contact kinds) ──────────────
type Row =
  | { kind: 'header'; id: string; label: string }
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
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? '#7C3AED';
}

/**
 * Circular avatar. `plain` (an invite / not-on-VelChat contact) is just a simple person glyph.
 * Otherwise: saved photo → coloured initial → person glyph — a real, colourful avatar.
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
      <Text variant="title" style={{ color: '#fff' }}>
        {initial}
      </Text>
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

/**
 * Resolve-on-tap row (§G2). Used two ways: for a bare number typed into search ("message a
 * number that isn't saved"), and for a saved contact when membership couldn't be checked up
 * front (backend degraded). Tap → look the number up in the directory: found → open the DM;
 * not found → offer an invite. Owns its own idle/searching/notfound state; resets on change.
 */
const LookupRow = React.memo(function LookupRow({
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

  // Title = the contact name if we have one, else the number itself. Subtitle carries the
  // number (named row) or the search hint (bare number); "Not on VelChat" once a tap misses.
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
      onPress={() => void onPress()}
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

  // A valid number typed into search that ISN'T already a matched contact → offer to find it
  // on VelChat (works even with no device contacts / permission — the laptop + "not saved" case).
  const matchedNumbers = useMemo(
    () => new Set(onVelchat.map(c => c.phoneE164)),
    [onVelchat],
  );
  const candidate = useMemo(() => {
    const c = normalize(query);
    return c && !matchedNumbers.has(c) ? c : null;
  }, [normalize, query, matchedNumbers]);

  // Filter + flatten the sections into one recycled list. When membership couldn't be checked
  // (discoveryFailed), every contact becomes a "lookup" row that resolves on tap.
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (name: string, phone: string): boolean =>
      q === '' || name.toLowerCase().includes(q) || phone.includes(q);
    const out: Row[] = [];
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
  }, [onVelchat, invitable, discoveryFailed, query, tr]);

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
      if (item.kind === 'lookup') {
        return (
          <LookupRow
            e164={item.contact.phoneE164}
            name={item.contact.name}
            thumbnailPath={item.contact.thumbnailPath}
            disabled={busyId !== null}
            lookup={lookup}
            onFound={openChat}
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
    [busyId, openChat, onInvite, shareInvite, lookup, tr],
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
          // When a number is being searched, the number row above carries the screen — don't
          // stack a full "no contacts" empty state under it.
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

      {/* Search by name or number — always available (number search needs no contacts). */}
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
          keyboardType="default"
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

      {/* Message yourself (WhatsApp-style self-chat) — pinned at the top when not searching. */}
      {self && query.trim() === '' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('newChat.messageYourself')}
          disabled={busyId !== null}
          onPress={() => void openChat(self, tr('newChat.messageYourself'))}
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
            <UserIcon size={22} color={t.colors.actionFg} strokeWidth={2.2} />
          </View>
          <Text
            variant="body"
            numberOfLines={1}
            style={{ flex: 1, fontSize: 16 }}
          >
            {tr('newChat.messageYourself')}
          </Text>
          {busyId === self ? (
            <ActivityIndicator size="small" color={t.colors.brandFrom} />
          ) : null}
        </Pressable>
      ) : null}

      {/* "Message a number that isn't saved" — a valid E.164 that isn't already a match. */}
      {candidate ? (
        <LookupRow
          e164={candidate}
          disabled={busyId !== null}
          lookup={lookup}
          onFound={openChat}
          onInvite={shareInvite}
        />
      ) : null}

      {/* Degraded: address book read, but membership couldn't be checked — tap resolves it. */}
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
