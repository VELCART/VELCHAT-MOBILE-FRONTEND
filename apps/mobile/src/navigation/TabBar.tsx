/**
 * Production bottom tab bar (§M16/§M17) for the swipeable tab pager (ADR-0002).
 * Flat, compact, safe-area-correct on iOS + Android, theme-aware. Signature: a soft
 * brand-tinted pill that springs in behind the active icon. Crisp SVG icons
 * (ADR-0001). Accessible (role/selected/label) and honours reduce-motion.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Pressable,
  Animated,
  AccessibilityInfo,
  StyleSheet,
  Platform,
} from 'react-native';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useActiveTab } from '../core';
import {
  Text,
  ChatIcon,
  CallIcon,
  SettingsIcon,
  UpdatesIcon,
  CommunitiesIcon,
  type IconProps,
} from '../design-system';

const ICONS: Record<string, React.FC<IconProps>> = {
  Chats: ChatIcon,
  Updates: UpdatesIcon,
  Communities: CommunitiesIcon,
  Calls: CallIcon,
  Settings: SettingsIcon,
};

function TabButton({
  routeName,
  label,
  active,
  reduceMotion,
  onPress,
  onLongPress,
}: {
  routeName: string;
  label: string;
  active: boolean;
  reduceMotion: boolean;
  onPress: () => void;
  onLongPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(active ? 1 : 0);
      return undefined;
    }
    const a = Animated.spring(anim, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    });
    a.start();
    return () => a.stop();
  }, [active, reduceMotion, anim]);

  const Icon = ICONS[routeName] ?? ChatIcon;
  // Distinctive active state: the icon sits in a SOLID brand pill. The glyph MUST
  // contrast with that pill in both themes — actionFg is white on the black pill
  // (light) and black on the white pill (dark). ('#FFFFFF' went white-on-white in dark.)
  const iconColor = active ? t.colors.actionFg : t.colors.textTertiary;
  const labelColor = active ? t.colors.brandFrom : t.colors.textTertiary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      // Native, borderless ripple on Android (premium platform feel centred on the
      // icon); iOS keeps the subtle press-dim since it has no ripple primitive.
      android_ripple={{
        color: `${t.colors.brandFrom}22`,
        borderless: true,
        radius: 34,
      }}
      style={({ pressed }) => ({
        flex: 1,
        // A comfortable, consistent touch target (≥48dp) on every density.
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: Platform.OS === 'ios' && pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          height: 32,
          width: 56,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 52,
            height: 32,
            borderRadius: 16,
            backgroundColor: t.colors.brandFrom,
            opacity: anim,
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1],
                }),
              },
            ],
            ...t.elevation.e1,
          }}
        />
        <Animated.View
          style={{
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.05],
                }),
              },
            ],
          }}
        >
          <Icon size={26} color={iconColor} strokeWidth={active ? 2.2 : 1.9} />
        </Animated.View>
      </View>
      <Text
        variant="caption"
        numberOfLines={1}
        style={{
          fontSize: 10.5,
          lineHeight: 13,
          marginTop: 3,
          color: labelColor,
          fontFamily: active
            ? t.typography.label.fontFamily
            : t.typography.caption.fontFamily,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TabBar({
  state,
  descriptors,
  navigation,
}: MaterialTopTabBarProps): React.JSX.Element {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);

  // Publish the focused tab so the shared HomeHeader can swap its title + actions.
  const activeName = state.routes[state.index]?.name ?? 'Chats';
  useEffect(() => {
    useActiveTab.getState().setName(activeName);
  }, [activeName]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => {
        if (mounted) setReduceMotion(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: t.colors.hairline,
        paddingTop: 8,
        // Sit above the system nav bar on EVERY Android nav mode (gesture bar OR
        // 3-button) and the iOS home indicator — insets.bottom is the real height when
        // edge-to-edge; fall back to a comfortable min when it's 0 (older 3-button).
        paddingBottom: Math.max(insets.bottom, 12),
        // Respect side notches/cutouts in landscape so tabs never hide under them.
        paddingLeft: insets.left,
        paddingRight: insets.right,
        // Soft lift so the bar reads as a distinct surface above content. iOS draws the
        // directional top shadow; Android uses elevation (its ambient shadow reads at
        // the top edge of a bottom-docked bar) — kept modest for a flat, premium look.
        shadowColor: '#000000',
        shadowOpacity: t.scheme === 'dark' ? 0.3 : 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -3 },
        elevation: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        const active = state.index === index;
        const rawLabel = descriptor?.options.tabBarLabel;
        const label = typeof rawLabel === 'string' ? rawLabel : route.name;

        const onPress = (): void => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!active && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        const onLongPress = (): void => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TabButton
            key={route.key}
            routeName={route.name}
            label={label}
            active={active}
            reduceMotion={reduceMotion}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
  );
}
