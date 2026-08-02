/**
 * Settings (§F1) — a WhatsApp-style flat list: a profile header (photo · name ·
 * number) up top, then plain icon+label rows (no boxes) with subtitles, and sign-out.
 * App language + Appearance are live rows — tap to cycle. Premium through spacing and
 * typography, not chrome. Themed light/dark; scrolls on short devices.
 */
import React, { useState } from 'react';
import { ScrollView, View, Pressable, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation, useLanguage } from '../i18n';
import { useTheme, useThemeMode, type ThemeMode } from '../theme';
import {
  Screen,
  Text,
  Divider,
  UserIcon,
  ShieldIcon,
  BellIcon,
  StorageIcon,
  GlobeIcon,
  MoonIcon,
  InfoIcon,
  LogOutIcon,
  ChevronRightIcon,
  SearchIcon,
  ScanIcon,
  EditIcon,
  type IconProps,
} from '../design-system';
import { appEnv } from '../core';
import { useAuthStore } from '../features/auth';
import { useProfileSummary } from '../features/user';
import { ProfilePeek } from './ProfilePeek';
import type { RootStackParamList } from './types';

function TopIcon({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.FC<IconProps>;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Icon size={22} color={t.colors.textPrimary} strokeWidth={2} />
    </Pressable>
  );
}

function SettingRow({
  icon: Icon,
  title,
  subtitle,
  value,
  onPress,
  danger = false,
}: {
  icon: React.FC<IconProps>;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  const tint = danger ? t.colors.danger : t.colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.lg,
        paddingHorizontal: t.spacing.xl,
        paddingVertical: t.spacing.md,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Icon size={23} color={tint} strokeWidth={1.9} />
      <View style={{ flex: 1 }}>
        <Text
          variant="body"
          style={{ color: danger ? t.colors.danger : t.colors.textPrimary }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="caption"
            color="tertiary"
            numberOfLines={1}
            style={{ marginTop: 1 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="caption" color="secondary">
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

const NEXT_THEME: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export function SettingsScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { mode, setMode } = useThemeMode();
  const { language, setLanguage, supported, names } = useLanguage();
  const { displayName, email, phone, avatar } = useProfileSummary();
  const initial = (displayName ?? '').trim().charAt(0).toUpperCase();
  const signOut = useAuthStore(s => s.signOut);
  const [peekOpen, setPeekOpen] = useState(false);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const onSignOut = (): void => {
    signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };
  const noop = (): void => undefined;

  const cycleTheme = (): void => setMode(NEXT_THEME[mode]);
  const cycleLanguage = (): void => {
    const idx = supported.indexOf(language);
    const next = supported[(idx + 1) % supported.length];
    if (next) setLanguage(next);
  };
  const themeName: Record<ThemeMode, string> = {
    system: tr('settings.themeSystem'),
    light: tr('settings.themeLight'),
    dark: tr('settings.themeDark'),
  };

  return (
    <Screen edges={['top']} padded={false}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 58,
          paddingLeft: t.spacing.xs,
          paddingRight: t.spacing.sm,
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
          style={{ fontSize: 21, marginLeft: t.spacing.xxs }}
        >
          {tr('tabs.settings')}
        </Text>

        <View style={{ flex: 1 }} />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xxs,
          }}
        >
          <TopIcon
            icon={SearchIcon}
            label={tr('header.search')}
            onPress={noop}
          />
          <TopIcon icon={ScanIcon} label={tr('settings.scan')} onPress={noop} />
          <TopIcon icon={EditIcon} label={tr('settings.edit')} onPress={noop} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: t.spacing.huge }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header — tap to open the Profile page, long-press to peek. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={displayName ?? tr('settings.addName')}
          onPress={() => navigation.navigate('Profile')}
          onLongPress={() => setPeekOpen(true)}
          delayLongPress={220}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.md,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: t.colors.bgSubtle,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              // Thin, theme-aware border around the user's photo.
              borderWidth: 1,
              borderColor: t.colors.hairline,
            }}
          >
            {avatar ? (
              <Image
                source={{ uri: avatar }}
                style={{ width: 58, height: 58 }}
                resizeMode="cover"
              />
            ) : initial ? (
              <Text
                variant="title"
                style={{ color: t.colors.textPrimary, fontSize: 24 }}
              >
                {initial}
              </Text>
            ) : (
              <UserIcon
                size={28}
                color={t.colors.textSecondary}
                strokeWidth={2}
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title" numberOfLines={1} style={{ fontSize: 19 }}>
              {displayName ?? tr('settings.addName')}
            </Text>
            <Text
              variant="body"
              color="secondary"
              numberOfLines={1}
              style={{ marginTop: 2 }}
            >
              {phone ?? email ?? tr('settings.addName')}
            </Text>
          </View>
          <ChevronRightIcon
            size={20}
            color={t.colors.textTertiary}
            strokeWidth={2}
          />
        </Pressable>

        <Divider style={{ marginVertical: t.spacing.xs }} />

        <SettingRow
          icon={UserIcon}
          title={tr('settings.account')}
          subtitle={tr('settings.accountSub')}
          onPress={noop}
        />
        <SettingRow
          icon={ShieldIcon}
          title={tr('settings.privacy')}
          subtitle={tr('settings.privacySub')}
          onPress={noop}
        />
        <SettingRow
          icon={BellIcon}
          title={tr('settings.notifications')}
          subtitle={tr('settings.notificationsSub')}
          onPress={noop}
        />
        <SettingRow
          icon={StorageIcon}
          title={tr('settings.storage')}
          subtitle={tr('settings.storageSub')}
          onPress={noop}
        />
        <SettingRow
          icon={GlobeIcon}
          title={tr('settings.language')}
          value={names[language]}
          onPress={cycleLanguage}
        />
        <SettingRow
          icon={MoonIcon}
          title={tr('settings.appearance')}
          value={themeName[mode]}
          onPress={cycleTheme}
        />
        <SettingRow
          icon={InfoIcon}
          title={tr('settings.help')}
          subtitle={tr('settings.helpSub')}
          onPress={noop}
        />

        <Divider style={{ marginVertical: t.spacing.xs }} />

        <SettingRow
          icon={LogOutIcon}
          title={tr('settings.signOut')}
          onPress={onSignOut}
          danger
        />

        <Text
          variant="caption"
          color="tertiary"
          align="center"
          style={{ marginTop: t.spacing.lg }}
        >
          VelChat · {appEnv.name} · v0.1.0
        </Text>
      </ScrollView>

      <ProfilePeek visible={peekOpen} onClose={() => setPeekOpen(false)} />
    </Screen>
  );
}
