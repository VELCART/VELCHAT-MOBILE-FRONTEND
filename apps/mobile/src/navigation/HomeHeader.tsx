/**
 * Home header (§F1) — shared above the four tabs, WhatsApp-style, and it adapts per
 * tab. Chats shows the VelChat wordmark + a search bar; the other tabs show their name
 * and their own action icons (Updates: search + downloads · Communities: mail · Calls:
 * search + meeting). Every tab keeps the ⋮ overflow (which also holds the offline
 * toggle) and the profile avatar (inside a spinning green "active" ring). Themed,
 * safe-area aware. The focused tab comes from the TabBar via `useActiveTab`.
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
  CameraIcon,
  DownloadIcon,
  MailIcon,
  VideoIcon,
  MoreIcon,
  UserIcon,
  SpinningRing,
  type IconProps,
} from '../design-system';
import { useConnectivity, useActiveTab } from '../core';
import { useProfileSummary } from '../features/user';
import { HeaderMenu, type HeaderMenuItem } from './HeaderMenu';
import type { RootStackParamList } from './types';

// The rotating "active" halo around the avatar — a lively green even in the B&W theme.
const RING_GREEN = '#25D366';

interface Action {
  key: string;
  Icon: React.FC<IconProps>;
  label: string;
  onPress: () => void;
}

function IconButton({
  icon: Icon,
  onPress,
  label,
}: {
  icon: React.FC<IconProps>;
  onPress: () => void;
  label: string;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Icon size={22} color={t.colors.textPrimary} strokeWidth={2} />
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
  const activeTab = useActiveTab(s => s.name);
  const { displayName, avatarUri } = useProfileSummary();
  const initial = (displayName ?? '').trim().charAt(0).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);

  const openSettings = (): void => navigation.navigate('Settings');
  const noop = (): void => undefined;
  const isChats = activeTab === 'Chats';

  // Per-tab action icons (sit left of the ⋮ + profile).
  const actions: Action[] =
    activeTab === 'Updates'
      ? [
          {
            key: 'search',
            Icon: SearchIcon,
            label: tr('header.search'),
            onPress: noop,
          },
          {
            key: 'download',
            Icon: DownloadIcon,
            label: tr('header.downloads'),
            onPress: noop,
          },
        ]
      : activeTab === 'Communities'
        ? [
            {
              key: 'mail',
              Icon: MailIcon,
              label: tr('header.mail'),
              onPress: noop,
            },
          ]
        : activeTab === 'Calls'
          ? [
              {
                key: 'search',
                Icon: SearchIcon,
                label: tr('header.search'),
                onPress: noop,
              },
              {
                key: 'meeting',
                Icon: VideoIcon,
                label: tr('header.meeting'),
                onPress: noop,
              },
            ]
          : [
              {
                key: 'camera',
                Icon: CameraIcon,
                label: tr('header.camera'),
                onPress: noop,
              },
            ];

  const menuItems: HeaderMenuItem[] = [
    {
      label: flightMode ? tr('header.goOnline') : tr('header.goOffline'),
      onPress: toggleFlight,
    },
    { label: tr('header.newGroup'), onPress: noop },
    { label: tr('header.starred'), onPress: noop },
    { label: tr('tabs.settings'), onPress: openSettings },
  ];

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: t.colors.bgBase }}>
      {/* Row 1 — title (left) + actions / ⋮ / profile (right) */}
      <View
        style={{
          height: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: t.spacing.lg,
          paddingRight: t.spacing.xs,
        }}
      >
        <View style={{ flex: 1 }}>
          {isChats ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
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
          ) : (
            <Text variant="title" numberOfLines={1} style={{ fontSize: 22 }}>
              {tr(`tabs.${activeTab.toLowerCase()}`)}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {actions.map(a => (
            <IconButton
              key={a.key}
              icon={a.Icon}
              onPress={a.onPress}
              label={a.label}
            />
          ))}
          <IconButton
            icon={MoreIcon}
            onPress={() => setMenuOpen(true)}
            label={tr('header.more')}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={openSettings}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              marginLeft: 2,
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
        </View>
      </View>

      {/* Row 2 — a full-width search bar (Chats only, WhatsApp-style) */}
      {isChats ? (
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
            onPress={noop}
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
      ) : (
        <View style={{ height: t.spacing.xs }} />
      )}

      <HeaderMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
      />
    </View>
  );
}
