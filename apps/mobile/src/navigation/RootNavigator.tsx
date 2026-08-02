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
import { AppStatusBar } from '../design-system';
import {
  WelcomeScreen,
  NotificationsScreen,
  SignInScreen,
  EnterPhoneScreen,
  ReverseOtpScreen,
  useAuthStore,
} from '../features/auth';
import { AppTabs } from './AppTabs';
import { SettingsScreen } from './SettingsScreen';
import { ProfileScreen } from './ProfileScreen';
import { ChatScreen } from '../features/chat';
import { SearchScreen } from '../features/search';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['velchat://', 'https://velchat.app'],
  config: {
    screens: {
      Welcome: 'welcome',
      Notifications: 'notifications',
      SignIn: 'signin',
      EnterPhone: 'phone',
      ReverseOtp: 'verify',
      AppTabs: {
        screens: {
          Chats: 'chats',
          Updates: 'updates',
          Communities: 'communities',
          Calls: 'calls',
        },
      },
      Settings: 'settings',
      Profile: 'profile',
      Search: 'search',
      Chat: 'chat/:conversationId',
    },
  },
};

export function RootNavigator(): React.JSX.Element {
  const t = useTheme();
  // Cold-start gating: a persisted session (tokens in MMKV) lands straight on the
  // app — no re-running onboarding/OTP. In-session transitions use navigation.reset.
  const authed = useAuthStore(s => s.state === 'active');
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
    <>
      <AppStatusBar />
      <NavigationContainer theme={navTheme} linking={linking}>
        <Stack.Navigator
          initialRouteName={authed ? 'AppTabs' : 'Welcome'}
          screenOptions={{ headerShown: false, animation: 'none' }}
        >
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="SignIn" component={SignInScreen} />
          {/* Reverse-OTP (missed-call) screens stay registered but off the flow — gated
            by featureFlags.reverseOtp (currently OFF). */}
          <Stack.Screen name="EnterPhone" component={EnterPhoneScreen} />
          <Stack.Screen name="ReverseOtp" component={ReverseOtpScreen} />
          <Stack.Screen name="AppTabs" component={AppTabs} />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ animation: 'slide_from_right' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
