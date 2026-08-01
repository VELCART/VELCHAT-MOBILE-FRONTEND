/**
 * App tab shell (§M17, ADR-0002). A shared home header on top, then four tabs —
 * Chats / Updates / Communities / Calls — on a native pager: TAP the bottom bar to
 * jump directly (animationEnabled:false → no slide-through) OR swipe left/right.
 * Settings opens from the header, not a tab. The first-run profile sheet + the offline
 * banner sit over the shell.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabBarProps,
} from '@react-navigation/material-top-tabs';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme';
import { Placeholder } from '../ui';
import { ProfileSetupSheet, useProfileGate } from '../features/user';
import { ChatsList } from '../features/chat';
import { TabBar } from './TabBar';
import { HomeHeader } from './HomeHeader';
import { OfflineBanner } from './OfflineBanner';
import type { AppTabsParamList } from './types';

const Tab = createMaterialTopTabNavigator<AppTabsParamList>();

function ChatsScreen(): React.JSX.Element {
  return <ChatsList />;
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
  const t = useTheme();
  const { t: tr } = useTranslation();
  // First-run profile prompt: opens only when the profile is incomplete.
  // Dismissing hides it for this session; it re-checks on the next launch.
  const { needsSetup, markComplete } = useProfileGate();
  const [dismissed, setDismissed] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bgBase }}>
      <HomeHeader />
      <OfflineBanner />
      <Tab.Navigator
        tabBarPosition="bottom"
        tabBar={renderTabBar}
        // animationEnabled:false → a tab TAP jumps straight to that page (no visible
        // slide through the tabs in between); swipe still pages via the native pager.
        screenOptions={{
          swipeEnabled: true,
          lazy: true,
          animationEnabled: false,
        }}
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
      </Tab.Navigator>

      <ProfileSetupSheet
        visible={needsSetup && !dismissed}
        onDone={markComplete}
        onClose={() => setDismissed(true)}
      />
    </View>
  );
}
