/**
 * Settings (§F1). A premium, sectioned screen matching the onboarding theme: a
 * profile header, an appearance (theme) picker, the app-wide language picker, a few
 * account rows, and sign-out. Themed light/dark; scrolls on short devices.
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
  PillButton,
  GlobeIcon,
  ShieldIcon,
  BellIcon,
  InfoIcon,
  ChevronRightIcon,
  StorageIcon,
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
        marginBottom: t.spacing.xs,
        marginLeft: t.spacing.xs,
        letterSpacing: 0.6,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

function SettingRow({
  icon: Icon,
  label,
  value,
  onPress,
  showChevron = true,
}: {
  icon: React.FC<IconProps>;
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
}): React.JSX.Element {
  const t = useTheme();
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
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.md,
        backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
      })}
    >
      <Icon size={20} color={t.colors.textSecondary} strokeWidth={2} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {value ? (
        <Text variant="caption" color="secondary">
          {value}
        </Text>
      ) : null}
      {onPress && showChevron ? (
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

  const initial = (displayName ?? '').trim().charAt(0).toUpperCase();
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
          paddingTop: t.spacing.lg,
          paddingBottom: t.spacing.huge,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="display" style={{ fontSize: 28, lineHeight: 34 }}>
          {tr('tabs.settings')}
        </Text>

        {/* Profile header */}
        <Card
          style={{
            marginTop: t.spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
          }}
        >
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: t.pastels.lavender,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              variant="title"
              style={{ color: t.colors.brandFrom, fontSize: 22 }}
            >
              {initial || '🙂'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" numberOfLines={1}>
              {displayName ?? tr('settings.addName')}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {phone ?? email ?? ''}
            </Text>
          </View>
        </Card>

        {/* Appearance */}
        <SectionLabel>{tr('settings.appearance')}</SectionLabel>
        <Card style={{ padding: t.spacing.xs }}>
          <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
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
                    backgroundColor: active
                      ? `${t.colors.brandFrom}22`
                      : 'transparent',
                  }}
                >
                  <Text
                    variant="caption"
                    style={{
                      color: active
                        ? t.colors.brandFrom
                        : t.colors.textSecondary,
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
        </Card>

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
                    gap: t.spacing.md,
                    paddingHorizontal: t.spacing.lg,
                    paddingVertical: t.spacing.md,
                    backgroundColor: pressed
                      ? t.colors.bgSubtle
                      : 'transparent',
                  })}
                >
                  {i === 0 ? (
                    <GlobeIcon
                      size={20}
                      color={t.colors.textSecondary}
                      strokeWidth={2}
                    />
                  ) : (
                    <View style={{ width: 20 }} />
                  )}
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
        <View style={{ marginTop: t.spacing.xxl }}>
          <PillButton
            label={tr('settings.signOut')}
            variant="ghost"
            leadingIcon="⏻"
            onPress={onSignOut}
          />
        </View>

        <Text
          variant="caption"
          color="tertiary"
          align="center"
          style={{ marginTop: t.spacing.lg }}
        >
          VelChat · {appEnv.name} · v{'0.1.0'}
        </Text>
      </ScrollView>
    </Screen>
  );
}
