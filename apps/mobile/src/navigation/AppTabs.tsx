/**
 * App tab shell (§M17). Skeleton tabs; real screens (chat list, calls, settings)
 * arrive in later phases. Themed tab bar (light/dark).
 */
import React from 'react';
import { View, Pressable, PanResponder } from 'react-native';
import {
  type BottomTabNavigationProp,
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation, useLanguage } from '../i18n';
import { useTheme } from '../theme';
import { Screen, Text, Card, Divider, PillButton } from '../design-system';
import { Placeholder } from '../ui';
import { useAuthStore } from '../features/auth';
import type { AppTabsParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<AppTabsParamList>();

const TAB_ORDER: Array<keyof AppTabsParamList> = ['Calls', 'Chats', 'Settings'];

function TabIcon({
  name,
  active,
}: {
  name: keyof AppTabsParamList;
  active: boolean;
}): React.JSX.Element {
  const t = useTheme();
  const color = active ? t.colors.textPrimary : t.colors.textTertiary;
  if (name === 'Chats') {
    return (
      <View
        style={{
          width: 22,
          height: 18,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: color,
          justifyContent: 'center',
          paddingHorizontal: 4,
          gap: 3,
        }}
      >
        <View style={{ height: 2, borderRadius: 2, backgroundColor: color }} />
        <View
          style={{
            width: 9,
            height: 2,
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      </View>
    );
  }
  if (name === 'Calls') {
    return (
      <View
        style={{
          width: 17,
          height: 22,
          borderLeftWidth: 3,
          borderBottomWidth: 3,
          borderColor: color,
          borderBottomLeftRadius: 9,
          transform: [{ rotate: '-42deg' }],
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: 21,
        height: 21,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }}
      />
    </View>
  );
}

function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps): React.JSX.Element {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        height: 72 + insets.bottom,
        paddingBottom: Math.max(insets.bottom, t.spacing.xs),
        paddingHorizontal: t.spacing.xl,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        backgroundColor: t.colors.surface,
        borderTopWidth: 1,
        borderTopColor: t.colors.hairline,
      }}
    >
      {state.routes.map((route, index) => {
        const active = state.index === index;
        const isPrimary = route.name === 'Chats';
        const onPress = (): void => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!active && !event.defaultPrevented)
            navigation.navigate(route.name);
        };
        const label = descriptors[route.key]!.options.tabBarLabel ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={typeof label === 'string' ? label : route.name}
            onPress={onPress}
            style={({ pressed }) => ({
              width: isPrimary ? 88 : 68,
              alignItems: 'center',
              gap: t.spacing.xxs,
              opacity: pressed ? 0.68 : 1,
              transform: [{ translateY: isPrimary ? -25 : 0 }],
            })}
          >
            {isPrimary ? (
              <View
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 31,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.colors.surface,
                  borderWidth: 8,
                  borderColor: t.colors.bgBase,
                  ...t.elevation.e2,
                }}
              >
                <TabIcon name="Chats" active />
              </View>
            ) : (
              <View style={{ height: 30, justifyContent: 'center' }}>
                <TabIcon
                  name={route.name as keyof AppTabsParamList}
                  active={active}
                />
              </View>
            )}
            <Text
              variant="caption"
              style={{
                color: active ? t.colors.textPrimary : t.colors.textTertiary,
              }}
            >
              {typeof label === 'string' ? label : route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SwipeableTabPage({
  tab,
  children,
}: {
  tab: keyof AppTabsParamList;
  children: React.ReactNode;
}): React.JSX.Element {
  const navigation = useNavigation<BottomTabNavigationProp<AppTabsParamList>>();
  const pan = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 12 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) < 56 || Math.abs(gesture.vx) < 0.2) return;
        const current = TAB_ORDER.indexOf(tab);
        const next = gesture.dx < 0 ? current + 1 : current - 1;
        const nextTab = TAB_ORDER[next];
        if (nextTab) navigation.navigate(nextTab);
      },
    }),
  ).current;
  return (
    <View {...pan.panHandlers} style={{ flex: 1 }}>
      {children}
    </View>
  );
}

function ChatsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <SwipeableTabPage tab="Chats">
      <Placeholder title={t('tabs.chats')} subtitle={t('common.empty')} />
    </SwipeableTabPage>
  );
}
function CallsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <SwipeableTabPage tab="Calls">
      <Placeholder title={t('tabs.calls')} subtitle={t('common.empty')} />
    </SwipeableTabPage>
  );
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
    <SwipeableTabPage tab="Settings">
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
    </SwipeableTabPage>
  );
}

export function AppTabs(): React.JSX.Element {
  const { t: tr } = useTranslation();
  return (
    <Tab.Navigator
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
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
