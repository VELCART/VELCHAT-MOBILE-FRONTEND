/**
 * App tab shell (§M17). Skeleton tabs; real screens (chat list, calls, settings)
 * arrive in later phases. Themed tab bar (light/dark).
 */
import React from 'react';
import { Text as RNText, View, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation, useLanguage } from '../i18n';
import { useTheme } from '../theme';
import { Screen, Text, Card, Divider, PillButton } from '../design-system';
import { Placeholder } from '../ui';
import { useAuthStore } from '../features/auth';
import type { AppTabsParamList, RootStackParamList } from './types';

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
    <Screen>
      <View style={{ flex: 1, marginTop: t.spacing.xl, gap: t.spacing.xl }}>
        <Text variant="title">{tr('tabs.settings')}</Text>

        <View>
          <Text variant="label">{tr('settings.language')}</Text>
          <Text
            variant="caption"
            color="secondary"
            style={{
              marginTop: t.spacing.xxs,
              marginBottom: t.spacing.sm,
            }}
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
          <RNText style={{ fontSize: 18, opacity: focused ? 1 : 0.5 }}>
            {ICON[route.name]}
          </RNText>
        ),
      })}
    >
      <Tab.Screen
        name="Chats"
        component={ChatsScreen}
        options={{ tabBarLabel: tr('tabs.chats') }}
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
  );
}
