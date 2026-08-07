/**
 * Profile page (§F1/§B3) — a WhatsApp-style profile screen reached from the Settings
 * profile card. A big centered avatar with a camera badge (tap → pick + upload), the
 * name + number beneath it, then editable Name / About rows and a read-only Phone row.
 * Editing is inline: tap the pencil, the value becomes a field, tap ✓ to save (PUT
 * /users/:id/profile, mirrored to MMKV so it renders instantly next time). Themed,
 * offline-first (seeded from the local mirror — never blocks on the network), animated.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme';
import {
  Screen,
  Text,
  Divider,
  FadeInUp,
  UserIcon,
  InfoIcon,
  CallIcon,
  MailIcon,
  ClockIcon,
  CalendarIcon,
  CameraIcon,
  EditIcon,
  ChevronRightIcon,
  type IconProps,
} from '../design-system';
import {
  useProfileSummary,
  useProfileDetails,
  useSaveProfile,
  useAvatarUpload,
} from '../features/user';
import { useAccountInfo } from '../features/auth';
import type { RootStackParamList } from './types';

const AVATAR = 120;

/** Human-readable "last login" — "Today, 3:42 PM" or "30 Jul 2026, 3:42 PM". */
function formatLoginTime(iso: string | null, todayLabel: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  if (d.toDateString() === new Date().toDateString()) {
    return `${todayLabel}, ${time}`;
  }
  const date = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${date}, ${time}`;
}

/** Date-only formatter for "member since" — e.g. "30 Jul 2026". */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * One profile field. Read-only rows just show a value; editable rows flip to an inline
 * text field on the pencil tap and commit on ✓. Kept local so each row owns its draft.
 */
function InfoRow({
  icon: Icon,
  label,
  value,
  placeholder,
  editable = false,
  multiline = false,
  hint,
  maxLength,
  onSave,
}: {
  icon: React.FC<IconProps>;
  label: string;
  value: string;
  placeholder: string;
  editable?: boolean;
  multiline?: boolean;
  hint?: string;
  maxLength?: number;
  onSave?: (next: string) => Promise<boolean>;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const begin = (): void => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const commit = async (): Promise<void> => {
    const trimmed = draft.trim();
    if (!onSave || trimmed === value.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const rowBase = {
    flexDirection: 'row' as const,
    alignItems: multiline ? ('flex-start' as const) : ('center' as const),
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.xl,
    paddingVertical: t.spacing.md,
  };

  if (editing) {
    return (
      <View style={rowBase}>
        <Icon size={22} color={t.colors.brandFrom} strokeWidth={1.9} />
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="tertiary">
            {label}
          </Text>
          <View
            style={{
              borderBottomWidth: 1.5,
              borderBottomColor: t.colors.brandFrom,
            }}
          >
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder={placeholder}
              placeholderTextColor={t.colors.textTertiary}
              multiline={multiline}
              maxLength={maxLength}
              autoCapitalize="sentences"
              autoCorrect={false}
              returnKeyType="done"
              blurOnSubmit={!multiline}
              onSubmitEditing={multiline ? undefined : commit}
              style={{
                fontFamily: t.typography.body.fontFamily,
                fontSize: 16,
                color: t.colors.textPrimary,
                paddingVertical: t.spacing.xs,
              }}
            />
          </View>
          {hint ? (
            <Text
              variant="caption"
              color="tertiary"
              style={{ marginTop: t.spacing.xs }}
            >
              {hint}
            </Text>
          ) : null}
        </View>
        {saving ? (
          <View
            style={{
              width: 36,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color={t.colors.brandFrom} />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('profile.save')}
            onPress={commit}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.colors.brandFrom,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              variant="label"
              style={{ color: t.colors.actionFg, fontSize: 17 }}
            >
              ✓
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole={editable ? 'button' : 'text'}
      accessibilityLabel={label}
      onPress={editable ? begin : undefined}
      disabled={!editable}
      style={({ pressed }) => ({
        ...rowBase,
        opacity: pressed && editable ? 0.6 : 1,
      })}
    >
      <Icon size={22} color={t.colors.textSecondary} strokeWidth={1.9} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" color="tertiary">
          {label}
        </Text>
        <Text
          variant="body"
          numberOfLines={multiline ? 3 : 1}
          style={{
            marginTop: 2,
            color: value ? t.colors.textPrimary : t.colors.textTertiary,
          }}
        >
          {value || placeholder}
        </Text>
      </View>
      {editable ? (
        <EditIcon size={19} color={t.colors.textTertiary} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
}

export function ProfileScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const summary = useProfileSummary();
  const { save } = useSaveProfile();
  const avatar = useAvatarUpload();
  const { remoteAvatarUrl } = useProfileDetails();
  // Pull server-truth phone/email/member-since/last-active into the reactive mirror.
  useAccountInfo();

  const name = summary.displayName ?? '';
  const about = summary.about ?? '';
  const avatarUri = avatar.localUri ?? summary.avatar ?? remoteAvatarUrl;

  // A freshly-uploaded photo attaches to the directory profile once its id lands.
  useEffect(() => {
    if (avatar.mediaId) void save({ avatarMediaId: avatar.mediaId });
  }, [avatar.mediaId, save]);

  // Saves write straight through to the reactive MMKV mirror, so the row re-renders
  // from `summary` the instant the PUT resolves — nothing to hold in local state.
  const saveName = (next: string): Promise<boolean> =>
    next.length < 1 ? Promise.resolve(false) : save({ displayName: next });
  const saveAbout = (next: string): Promise<boolean> => save({ about: next });

  return (
    <Screen edges={['top']} padded={false}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.xs,
          height: 56,
          paddingHorizontal: t.spacing.sm,
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
        <Text variant="title" style={{ fontSize: 20 }}>
          {tr('profile.pageTitle')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: t.spacing.huge }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar + name + number */}
        <FadeInUp style={{ alignItems: 'center' }}>
          <View
            style={{
              alignItems: 'center',
              paddingTop: t.spacing.lg,
              paddingBottom: t.spacing.xl,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('profile.addPhoto')}
              onPress={avatar.pick}
              hitSlop={8}
              style={({ pressed }) => ({
                transform: [{ scale: pressed ? 0.97 : 1 }],
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
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ width: AVATAR, height: AVATAR }}
                    resizeMode="cover"
                  />
                ) : (
                  // No photo → the default person avatar (NOT the name's initial), so a
                  // removed photo falls back to a clean placeholder on your own profile.
                  <UserIcon
                    size={56}
                    color={t.colors.textTertiary}
                    strokeWidth={1.8}
                  />
                )}
                {avatar.uploading ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <View
                style={{
                  position: 'absolute',
                  right: 2,
                  bottom: 2,
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: t.colors.brandFrom,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: t.colors.bgBase,
                }}
              >
                <CameraIcon
                  size={18}
                  color={t.colors.actionFg}
                  strokeWidth={2}
                />
              </View>
            </Pressable>

            <Text
              variant="title"
              align="center"
              numberOfLines={1}
              style={{ marginTop: t.spacing.md, fontSize: 22 }}
            >
              {name || tr('settings.addName')}
            </Text>
            {summary.phone ? (
              <Text
                variant="body"
                color="secondary"
                align="center"
                style={{ marginTop: t.spacing.xxs }}
              >
                {summary.phone}
              </Text>
            ) : null}
          </View>
        </FadeInUp>

        {/* Editable info */}
        <FadeInUp delay={90}>
          <Divider style={{ marginHorizontal: t.spacing.xl }} />
          <InfoRow
            icon={UserIcon}
            label={tr('profile.name')}
            value={name}
            placeholder={tr('profile.namePlaceholder')}
            editable
            hint={tr('profile.nameHint')}
            maxLength={40}
            onSave={saveName}
          />
          <Divider style={{ marginHorizontal: t.spacing.xl }} />
          <InfoRow
            icon={InfoIcon}
            label={tr('profile.about')}
            value={about || tr('profile.aboutEmpty')}
            placeholder={tr('profile.aboutPlaceholder')}
            editable
            multiline
            maxLength={140}
            onSave={saveAbout}
          />
          <Divider style={{ marginHorizontal: t.spacing.xl }} />
          <InfoRow
            icon={CallIcon}
            label={tr('profile.phone')}
            value={summary.phone ?? ''}
            placeholder="—"
          />
          <Divider style={{ marginHorizontal: t.spacing.xl }} />
          <InfoRow
            icon={MailIcon}
            label={tr('profile.email')}
            value={summary.email ?? ''}
            placeholder={tr('profile.emailEmpty')}
          />
          <Divider style={{ marginHorizontal: t.spacing.xl }} />
          <InfoRow
            icon={ClockIcon}
            label={tr('profile.lastLogin')}
            value={formatLoginTime(summary.loginAt, tr('profile.today'))}
            placeholder="—"
          />
          <Divider style={{ marginHorizontal: t.spacing.xl }} />
          <InfoRow
            icon={CalendarIcon}
            label={tr('profile.memberSince')}
            value={formatDate(summary.memberSince)}
            placeholder="—"
          />
          <Divider style={{ marginHorizontal: t.spacing.xl }} />
        </FadeInUp>
      </ScrollView>
    </Screen>
  );
}
