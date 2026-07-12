/**
 * Root navigation (§M17). native-stack: Welcome -> AppTabs. Deep-link scheme
 * registered (velchat://). Navigation theme is derived from the app theme so
 * container background matches light/dark with no flash.
 */
import React from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  type LinkingOptions,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { WelcomeScreen } from '../features/auth';
import { AppTabs } from './AppTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['velchat://', 'https://velchat.app'],
  config: {
    screens: {
      Welcome: 'welcome',
      AppTabs: {
        screens: { Chats: 'chats', Calls: 'calls', Settings: 'settings' },
      },
    },
  },
};

export function RootNavigator(): React.JSX.Element {
  const t = useTheme();
  const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: t.colors.bgBase,
      card: t.colors.bgBase,
      text: t.colors.textPrimary,
      primary: t.colors.brandFrom,
      border: t.colors.hairline,
    },
  };

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="AppTabs" component={AppTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
