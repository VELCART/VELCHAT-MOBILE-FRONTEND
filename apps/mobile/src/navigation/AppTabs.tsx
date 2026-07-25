/**
 * App tab shell (§M17, ADR-0002). Five tabs — Chats / Updates / Communities / Calls
 * / Settings — on a native pager: tap the bottom bar OR swipe left/right to change
 * page (WhatsApp-parity). Screens are placeholders until their phases land; Settings
 * already hosts the language picker + sign-out. Themed, light/dark.
 */
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabBarProps,
} from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation, useLanguage } from '../i18n';
import { useTheme } from '../theme';
import { Screen, Text, Card, Divider, PillButton } from '../design-system';
import { Placeholder } from '../ui';
import { useAuthStore } from '../features/auth';
import { ProfileSetupSheet, useProfileGate } from '../features/user';
import { TabBar } from './TabBar';
import type { AppTabsParamList, RootStackParamList } from './types';

const Tab = createMaterialTopTabNavigator<AppTabsParamList>();

function ChatsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.chats')} subtitle={t('common.empty')} />;
}
function UpdatesScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.updates')} subtitle={t('common.empty')} />;
}
function CommunitiesScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Placeholder title={t('tabs.communities')} subtitle={t('common.empty')} />
  );
}
function CallsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.calls')} subtitle={t('common.empty')} />;
}

/** Settings — app-wide language picker (instant + persisted) and sign-out. */
function SettingsScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { language, setLanguage, supported, names } = useLanguage();
  const signOut = useAuthStore(s => s.signOut);
  const navigation = useNavigation();

  const onSignOut = (): void => {
    signOut();
    // Reset the ROOT stack (this screen lives inside AppTabs) back to onboarding.
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  return (
    <Screen edges={['top']}>
      <View style={{ flex: 1, marginTop: t.spacing.xl, gap: t.spacing.xl }}>
        <Text variant="title">{tr('tabs.settings')}</Text>

        <View>
          <Text variant="label">{tr('settings.language')}</Text>
          <Text
            variant="caption"
            color="secondary"
            style={{ marginTop: t.spacing.xxs, marginBottom: t.spacing.sm }}
          >
            {tr('settings.languageSubtitle')}
          </Text>
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
                      justifyContent: 'space-between',
                      paddingHorizontal: t.spacing.lg,
                      paddingVertical: t.spacing.md,
                      backgroundColor: pressed
                        ? t.colors.bgSubtle
                        : 'transparent',
                    })}
                  >
                    <Text
                      variant="body"
                      style={{
                        color: active
                          ? t.colors.brandFrom
                          : t.colors.textPrimary,
                      }}
                    >
                      {names[code]}
                    </Text>
                    {active ? (
                      <Text
                        variant="label"
                        style={{ color: t.colors.brandFrom }}
                      >
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </Card>
        </View>

        <View style={{ flex: 1 }} />

        <PillButton
          label={tr('settings.signOut')}
          variant="ghost"
          onPress={onSignOut}
          style={{ marginBottom: t.spacing.lg }}
        />
      </View>
    </Screen>
  );
}

// Render via JSX so TabBar mounts as a real component with its own hook context
// (passing it directly makes React Navigation call it as a function → invalid hooks).
const renderTabBar = (props: MaterialTopTabBarProps): React.JSX.Element => (
  <TabBar {...props} />
);

export function AppTabs(): React.JSX.Element {
  const { t: tr } = useTranslation();
  // First-run profile prompt: opens only when the directory profile has no name yet.
  // Dismissing hides it for this session; it re-checks on the next launch.
  const { needsSetup, markComplete } = useProfileGate();
  const [dismissed, setDismissed] = useState(false);

  return (
    <>
      <Tab.Navigator
        tabBarPosition="bottom"
        tabBar={renderTabBar}
        screenOptions={{ swipeEnabled: true, lazy: true }}
      >
        <Tab.Screen
          name="Chats"
          component={ChatsScreen}
          options={{ tabBarLabel: tr('tabs.chats') }}
        />
        <Tab.Screen
          name="Updates"
          component={UpdatesScreen}
          options={{ tabBarLabel: tr('tabs.updates') }}
        />
        <Tab.Screen
          name="Communities"
          component={CommunitiesScreen}
          options={{ tabBarLabel: tr('tabs.communities') }}
        />
        <Tab.Screen
          name="Calls"
          component={CallsScreen}
          options={{ tabBarLabel: tr('tabs.calls') }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ tabBarLabel: tr('tabs.settings') }}
        />
      </Tab.Navigator>

      <ProfileSetupSheet
        visible={needsSetup && !dismissed}
        onDone={markComplete}
        onClose={() => setDismissed(true)}
      />
    </>
  );
}
