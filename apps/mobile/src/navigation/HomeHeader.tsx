/**
 * Home header (§F1) — shared across the four tabs, WhatsApp-style. Row 1: the VelChat
 * wordmark (left) + a tight cluster on the right — profile (avatar inside a spinning
 * green "active" ring), a Wi-Fi/offline toggle, and an overflow ⋮ that opens a
 * dropdown menu. Row 2: a full-width search bar. Safe-area aware; themed light/dark.
 */
import React, { useState } from 'react';
import { View, Pressable, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme';
import {
  Text,
  SearchIcon,
  WifiIcon,
  WifiOffIcon,
  MoreIcon,
  UserIcon,
  SpinningRing,
  type IconProps,
} from '../design-system';
import { useConnectivity } from '../core';
import { useProfileSummary } from '../features/user';
import { HeaderMenu, type HeaderMenuItem } from './HeaderMenu';
import type { RootStackParamList } from './types';

// The rotating "active" halo around the avatar — a lively green even in the B&W theme.
const RING_GREEN = '#25D366';

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
      hitSlop={6}
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
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const flightMode = useConnectivity(s => s.flightMode);
  const toggleFlight = useConnectivity(s => s.toggleFlightMode);
  const { displayName, avatarUri } = useProfileSummary();
  const initial = (displayName ?? '').trim().charAt(0).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);

  const openSettings = (): void => navigation.navigate('Settings');
  const menuItems: HeaderMenuItem[] = [
    { label: tr('header.newGroup'), onPress: () => undefined },
    { label: tr('header.starred'), onPress: () => undefined },
    { label: tr('tabs.settings'), onPress: openSettings },
  ];

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: t.colors.bgBase }}>
      {/* Row 1 — wordmark + tight right cluster */}
      <View
        style={{
          height: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: t.spacing.lg,
          paddingRight: t.spacing.sm,
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={openSettings}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SpinningRing size={38} color={RING_GREEN} thickness={2.5} />
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: t.colors.bgSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ width: 30, height: 30 }}
                    resizeMode="cover"
                  />
                ) : initial ? (
                  <Text
                    variant="label"
                    style={{ color: t.colors.textPrimary, fontSize: 14 }}
                  >
                    {initial}
                  </Text>
                ) : (
                  <UserIcon
                    size={17}
                    color={t.colors.textSecondary}
                    strokeWidth={2}
                  />
                )}
              </View>
            </View>
          </Pressable>

          <IconButton
            icon={flightMode ? WifiOffIcon : WifiIcon}
            onPress={toggleFlight}
            active={flightMode}
            label={flightMode ? 'Go online' : 'Go offline'}
          />
          <IconButton
            icon={MoreIcon}
            onPress={() => setMenuOpen(true)}
            label="More options"
          />
        </View>
      </View>

      {/* Row 2 — search bar (WhatsApp-style) */}
      <View
        style={{
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.xxs,
          paddingBottom: t.spacing.sm,
        }}
      >
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={tr('header.search')}
          onPress={() => undefined}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            height: 42,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.bgSubtle,
            paddingHorizontal: t.spacing.md,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <SearchIcon
            size={19}
            color={t.colors.textSecondary}
            strokeWidth={2}
          />
          <Text variant="body" color="secondary">
            {tr('header.search')}
          </Text>
        </Pressable>
      </View>

      <HeaderMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
      />
    </View>
  );
}
