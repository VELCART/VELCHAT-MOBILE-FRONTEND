/**
 * Root navigation (§M17). native-stack: Welcome -> AppTabs. Deep-link scheme
 * registered (velchat://). Navigation theme is derived from the app theme so
 * container background matches light/dark with no flash.
 */
import React, { useEffect, useRef } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
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
  hasStoredSession,
  useSessionWatch,
} from '../features/auth';
import { AppTabs } from './AppTabs';
import { SettingsScreen } from './SettingsScreen';
import { ProfileScreen } from './ProfileScreen';
import { ChatScreen, NewChatScreen } from '../features/chat';
import { SearchScreen } from '../features/search';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['velchat://', 'https://velchat.app'],
  /**
   * A deep link is only honoured while there is a session.
   *
   * Notifications outlive a sign-out: the native side keeps its own credentials so it can
   * acknowledge a push with no JS alive, and a notification already in the tray survives the
   * app's auth state changing underneath it. Without this, tapping one on a signed-out install
   * navigated straight to `Chat` — the linking config is evaluated independently of
   * `initialRouteName`, so the auth gate simply was not in the path. The user was left looking at
   * a conversation from behind the sign-in screen.
   *
   * The predicate is `hasStoredSession()` — tokens present on the device — and NOT the auth store's
   * `active`. A notification tapped from cold arrives at the container before the store has
   * hydrated, so asking the store would drop exactly the link this path exists for and land the
   * user on the chat list instead of the chat they tapped. `hasSession` reads MMKV synchronously,
   * so it is already true at that moment for anyone who has signed in. It comes through the auth
   * feature rather than straight from `infra` because navigation may not reach past it (§M3).
   */
  filter: () => hasStoredSession(),
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
      NewChat: 'new-chat',
      Chat: 'chat/:conversationId',
    },
  },
};

export function RootNavigator(): React.JSX.Element {
  const t = useTheme();
  // Cold-start gating: a persisted session (tokens in MMKV) lands straight on the
  // app — no re-running onboarding/OTP. In-session transitions use navigation.reset.
  const authed = useAuthStore(s => s.state === 'active');
  // Detect a mid-session expiry (token revoked/refresh-failed → machine flips to
  // signed_out) and reactively reset to sign-in, instead of stranding the user logged-in.
  useSessionWatch();
  const navRef = useNavigationContainerRef<RootStackParamList>();
  const wasAuthed = useRef(authed);
  useEffect(() => {
    if (wasAuthed.current && !authed && navRef.isReady()) {
      navRef.resetRoot({ index: 0, routes: [{ name: 'Welcome' }] });
    }
    wasAuthed.current = authed;
  }, [authed, navRef]);
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
      <NavigationContainer ref={navRef} theme={navTheme} linking={linking}>
        <Stack.Navigator
          initialRouteName={authed ? 'AppTabs' : 'Welcome'}
          // Instant navigation everywhere (§R4 "fast"): no transition animation — a tap swaps
          // screens immediately (WhatsApp-fast). Screens render from the local DB/cache, so
          // there's no blank flash. Auth flow keeps its own feel; the rest is snap-instant.
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
            options={{ animation: 'none' }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ animation: 'none' }}
          />
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{ animation: 'none' }}
          />
          <Stack.Screen
            name="NewChat"
            component={NewChatScreen}
            options={{ animation: 'none' }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ animation: 'none' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
