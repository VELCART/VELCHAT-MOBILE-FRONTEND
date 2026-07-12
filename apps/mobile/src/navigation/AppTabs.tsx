/**
 * App tab shell (§M17). Skeleton tabs; real screens (chat list, calls, settings)
 * arrive in later phases. Themed tab bar (light/dark).
 */
import React from 'react';
import { Text as RNText } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme';
import { Placeholder } from '../ui';
import type { AppTabsParamList } from './types';

const Tab = createBottomTabNavigator<AppTabsParamList>();

const ICON: Record<keyof AppTabsParamList, string> = {
  Chats: '💬',
  Calls: '📞',
  Settings: '⚙️',
};

function ChatsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.chats')} subtitle={t('common.empty')} />;
}
function CallsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.calls')} subtitle={t('common.empty')} />;
}
function SettingsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.settings')} subtitle={t('common.empty')} />;
}

export function AppTabs(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.colors.textPrimary,
        tabBarInactiveTintColor: t.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: t.colors.bgBase,
          borderTopColor: t.colors.hairline,
        },
        // eslint-disable-next-line react/no-unstable-nested-components -- tabBarIcon is a render prop by design
        tabBarIcon: ({ focused }) => (
          <RNText style={{ fontSize: 18, opacity: focused ? 1 : 0.5 }}>{ICON[route.name]}</RNText>
        ),
      })}
    >
      <Tab.Screen name="Chats" component={ChatsScreen} options={{ tabBarLabel: tr('tabs.chats') }} />
      <Tab.Screen name="Calls" component={CallsScreen} options={{ tabBarLabel: tr('tabs.calls') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: tr('tabs.settings') }} />
    </Tab.Navigator>
  );
}
