/**
 * Home header (§F1) — shared across the four tabs, WhatsApp-style. Left: the VelChat
 * wordmark. Right: profile (avatar photo when set, else initial / person icon),
 * search, a flight-mode toggle that takes the whole app offline, and an overflow
 * menu. Profile + overflow open Settings. Safe-area aware; themed light/dark.
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import {
  Text,
  SearchIcon,
  PlaneIcon,
  MoreIcon,
  UserIcon,
  type IconProps,
} from '../design-system';
import { useConnectivity } from '../core';
import { useProfileSummary } from '../features/user';
import type { RootStackParamList } from './types';

function IconButton({
  icon: Icon,
  onPress,
  label,
  active = false,
}: {
  icon: React.FC<IconProps>;
  onPress: () => void;
  label: string;
  active?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? `${t.colors.brandFrom}1F` : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon
        size={22}
        color={active ? t.colors.brandFrom : t.colors.textPrimary}
        strokeWidth={2}
      />
    </Pressable>
  );
}

export function HomeHeader(): React.JSX.Element {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const flightMode = useConnectivity(s => s.flightMode);
  const toggleFlight = useConnectivity(s => s.toggleFlightMode);
  const { displayName } = useProfileSummary();
  const initial = (displayName ?? '').trim().charAt(0).toUpperCase();

  const openSettings = (): void => navigation.navigate('Settings');

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: t.colors.bgBase }}>
      <View
        style={{
          height: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.spacing.lg,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline' }}>
          <Text
            variant="title"
            style={{ fontSize: 23, color: t.colors.textPrimary }}
          >
            Vel
          </Text>
          <Text
            variant="title"
            style={{ fontSize: 23, color: t.colors.brandFrom }}
          >
            Chat
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xxs,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={openSettings}
            hitSlop={8}
            style={({ pressed }) => ({
              marginRight: t.spacing.xxs,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: t.pastels.lavender,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initial ? (
                <Text
                  variant="label"
                  style={{ color: t.colors.brandFrom, fontSize: 15 }}
                >
                  {initial}
                </Text>
              ) : (
                <UserIcon
                  size={18}
                  color={t.colors.brandFrom}
                  strokeWidth={2}
                />
              )}
            </View>
          </Pressable>

          <IconButton
            icon={SearchIcon}
            onPress={() => undefined}
            label="Search"
          />
          <IconButton
            icon={PlaneIcon}
            onPress={toggleFlight}
            active={flightMode}
            label="Flight mode"
          />
          <IconButton
            icon={MoreIcon}
            onPress={openSettings}
            label="More options"
          />
        </View>
      </View>
    </View>
  );
}
