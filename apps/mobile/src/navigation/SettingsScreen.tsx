/**
 * Settings (§F1). A product-grade, inset-grouped list matching the onboarding theme:
 * a name/number header (no avatar), an appearance segmented control, the app-wide
 * language picker, account rows with icon tiles, and sign-out. Themed light/dark;
 * scrolls on short devices.
 */
import React from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation, useLanguage } from '../i18n';
import { useTheme, useThemeMode, type ThemeMode } from '../theme';
import {
  Screen,
  Text,
  Card,
  Divider,
  ShieldIcon,
  BellIcon,
  InfoIcon,
  ChevronRightIcon,
  StorageIcon,
  LogOutIcon,
  type IconProps,
} from '../design-system';
import { appEnv } from '../core';
import { useAuthStore } from '../features/auth';
import { useProfileSummary } from '../features/user';
import type { RootStackParamList } from './types';

function SectionLabel({ children }: { children: string }): React.JSX.Element {
  const t = useTheme();
  return (
    <Text
      variant="caption"
      color="tertiary"
      style={{
        marginTop: t.spacing.xl,
        marginBottom: t.spacing.sm,
        marginLeft: t.spacing.sm,
        letterSpacing: 0.8,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

/** An account row: a subtle icon tile + label + chevron. */
function SettingRow({
  icon: Icon,
  label,
  onPress,
  danger = false,
}: {
  icon: React.FC<IconProps>;
  label: string;
  onPress?: () => void;
  danger?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  const tint = danger ? t.colors.danger : t.colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.md,
        paddingVertical: t.spacing.sm + 2,
        backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: danger ? `${t.colors.danger}18` : t.colors.bgSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} color={tint} strokeWidth={2} />
      </View>
      <Text
        variant="body"
        style={{
          flex: 1,
          color: danger ? t.colors.danger : t.colors.textPrimary,
        }}
      >
        {label}
      </Text>
      {onPress && !danger ? (
        <ChevronRightIcon
          size={18}
          color={t.colors.textTertiary}
          strokeWidth={2}
        />
      ) : null}
    </Pressable>
  );
}

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

export function SettingsScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { mode, setMode } = useThemeMode();
  const { language, setLanguage, supported, names } = useLanguage();
  const { displayName, email, phone } = useProfileSummary();
  const signOut = useAuthStore(s => s.signOut);
  const navigation = useNavigation();

  const onSignOut = (): void => {
    signOut();
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  const themeLabel: Record<ThemeMode, string> = {
    system: tr('settings.themeSystem'),
    light: tr('settings.themeLight'),
    dark: tr('settings.themeDark'),
  };

  return (
    <Screen edges={['top']} padded={false}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.spacing.xl,
          paddingTop: t.spacing.md,
          paddingBottom: t.spacing.huge,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="title" style={{ fontSize: 26 }}>
          {tr('tabs.settings')}
        </Text>

        {/* Name / number header — no avatar. */}
        <Card
          style={{ marginTop: t.spacing.lg, paddingVertical: t.spacing.md }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => undefined}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View style={{ flex: 1 }}>
              <Text variant="title" numberOfLines={1} style={{ fontSize: 20 }}>
                {displayName ?? tr('settings.addName')}
              </Text>
              <Text
                variant="body"
                color="secondary"
                numberOfLines={1}
                style={{ marginTop: 2 }}
              >
                {phone ?? email ?? ''}
              </Text>
            </View>
            <ChevronRightIcon
              size={20}
              color={t.colors.textTertiary}
              strokeWidth={2}
            />
          </Pressable>
        </Card>

        {/* Appearance — iOS-style segmented control. */}
        <SectionLabel>{tr('settings.appearance')}</SectionLabel>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: t.colors.bgSubtle,
            borderRadius: t.radius.md,
            padding: 4,
          }}
        >
          {THEME_MODES.map(m => {
            const active = m === mode;
            return (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: t.spacing.sm,
                  borderRadius: t.radius.sm,
                  alignItems: 'center',
                  backgroundColor: active ? t.colors.surface : 'transparent',
                  ...(active ? t.elevation.e1 : {}),
                }}
              >
                <Text
                  variant="caption"
                  style={{
                    fontSize: 13,
                    color: active ? t.colors.brandFrom : t.colors.textSecondary,
                    fontFamily: active
                      ? t.typography.label.fontFamily
                      : t.typography.caption.fontFamily,
                  }}
                >
                  {themeLabel[m]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Language */}
        <SectionLabel>{tr('settings.language')}</SectionLabel>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {supported.map((code, i) => {
            const active = code === language;
            return (
              <React.Fragment key={code}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLanguage(code)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: t.spacing.md,
                    paddingVertical: t.spacing.md,
                    backgroundColor: pressed
                      ? t.colors.bgSubtle
                      : 'transparent',
                  })}
                >
                  <Text
                    variant="body"
                    style={{
                      flex: 1,
                      color: active ? t.colors.brandFrom : t.colors.textPrimary,
                    }}
                  >
                    {names[code]}
                  </Text>
                  {active ? (
                    <Text variant="label" style={{ color: t.colors.brandFrom }}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              </React.Fragment>
            );
          })}
        </Card>

        {/* Account */}
        <SectionLabel>{tr('settings.account')}</SectionLabel>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <SettingRow
            icon={ShieldIcon}
            label={tr('settings.privacy')}
            onPress={() => undefined}
          />
          <Divider />
          <SettingRow
            icon={BellIcon}
            label={tr('settings.notifications')}
            onPress={() => undefined}
          />
          <Divider />
          <SettingRow
            icon={StorageIcon}
            label={tr('settings.storage')}
            onPress={() => undefined}
          />
          <Divider />
          <SettingRow
            icon={InfoIcon}
            label={tr('settings.help')}
            onPress={() => undefined}
          />
        </Card>

        {/* Sign out */}
        <View style={{ marginTop: t.spacing.xl }} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <SettingRow
            icon={LogOutIcon}
            label={tr('settings.signOut')}
            onPress={onSignOut}
            danger
          />
        </Card>

        <Text
          variant="caption"
          color="tertiary"
          align="center"
          style={{ marginTop: t.spacing.xl }}
        >
          VelChat · {appEnv.name} · v0.1.0
        </Text>
      </ScrollView>
    </Screen>
  );
}
