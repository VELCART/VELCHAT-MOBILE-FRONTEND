/**
 * App tab shell (§M17, ADR-0002). Five tabs — Chats / Updates / Communities / Calls
 * / Settings — on a native pager: tap the bottom bar OR swipe left/right to change
 * page (WhatsApp-parity). Chat screens are placeholders until their phases land;
 * Settings is its own screen. The first-run profile sheet opens over home when the
 * profile is incomplete.
 */
import React, { useState } from 'react';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabBarProps,
} from '@react-navigation/material-top-tabs';
import { useTranslation } from '../i18n';
import { Placeholder } from '../ui';
import { ProfileSetupSheet, useProfileGate } from '../features/user';
import { TabBar } from './TabBar';
import { SettingsScreen } from './SettingsScreen';
import type { AppTabsParamList } from './types';

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

// Render via JSX so TabBar mounts as a real component with its own hook context
// (passing it directly makes React Navigation call it as a function → invalid hooks).
const renderTabBar = (props: MaterialTopTabBarProps): React.JSX.Element => (
  <TabBar {...props} />
);

export function AppTabs(): React.JSX.Element {
  const { t: tr } = useTranslation();
  // First-run profile prompt: opens only when the profile is incomplete.
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
