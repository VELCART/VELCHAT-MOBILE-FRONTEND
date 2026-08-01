/**
 * Profile peek (§F1) — a long-press preview popup for the profile avatar (WhatsApp/iOS
 * style). Shows the photo enlarged with the name, and two quick actions: View profile
 * and Change photo. Dark scrim, spring scale-in, tap-outside to dismiss. Reactive — the
 * avatar reflects the live mirror, and Change photo persists to the backend + everywhere.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Pressable,
  Image,
  Animated,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme';
import {
  Text,
  FrostedCircle,
  UserIcon,
  CameraIcon,
  type IconProps,
} from '../design-system';
import { useProfileSummary, useAvatarPicker } from '../features/user';
import type { RootStackParamList } from './types';

const SIZE = 240;

// A frosted-glass circular action button (translucent, light-rimmed) with a label
// beneath — designed to sit on the dark peek scrim and read as "glass / water".
function PeekAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.FC<IconProps>;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: t.spacing.xs,
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.93 : 1 }],
      })}
    >
      <FrostedCircle size={64}>
        <Icon size={25} color="#000" strokeWidth={2} />
      </FrostedCircle>
      <Text variant="caption" style={{ color: 'rgb(255, 255, 255)' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProfilePeek({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { displayName, avatarUri } = useProfileSummary();
  const { pick } = useAvatarPicker();
  const initial = (displayName ?? '').trim().charAt(0).toUpperCase();

  const [rendered, setRendered] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      const a = Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 7,
      });
      a.start();
      return () => a.stop();
    }
    const a = Animated.timing(anim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    });
    a.start(({ finished }) => {
      if (finished) setRendered(false);
    });
    return () => a.stop();
  }, [visible, anim]);

  if (!rendered) return null;

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  const openProfile = (): void => {
    onClose();
    navigation.navigate('Profile');
  };
  const changePhoto = (): void => {
    onClose();
    void pick();
  };

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('common.dismiss')}
        onPress={onClose}
        style={{ flex: 1 }}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: '#000000',
              opacity: Animated.multiply(anim, 0.6),
            },
          ]}
        />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: t.spacing.xl,
          }}
        >
          <Animated.View
            style={{
              alignItems: 'center',
              width: '100%',
              opacity: anim,
              transform: [{ scale }],
            }}
          >
            <View
              style={{
                width: SIZE,
                height: SIZE,
                borderRadius: t.radius.xl,
                backgroundColor: t.colors.bgSubtle,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                // Thin, theme-aware border around the photo.
                borderWidth: 1,
                borderColor: t.colors.hairline,
              }}
            >
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={{ width: SIZE, height: SIZE }}
                  resizeMode="cover"
                />
              ) : initial ? (
                <Text
                  variant="display"
                  style={{
                    fontSize: 92,
                    lineHeight: 104,
                    color: t.colors.textSecondary,
                  }}
                >
                  {initial}
                </Text>
              ) : (
                <UserIcon
                  size={110}
                  color={t.colors.textTertiary}
                  strokeWidth={1.6}
                />
              )}
            </View>

            {/* <Text
              variant="title"
              numberOfLines={1}
              align="center"
              style={{
                color: '#FFFFFF',
                marginTop: t.spacing.lg,
                fontSize: 22,
              }}
            >
              {displayName ?? tr('settings.addName')}
            </Text> */}

            {/* Two separate frosted-glass circles, spaced apart. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: t.spacing.xxl,
                marginTop: t.spacing.xl,
              }}
            >
              <PeekAction
                icon={UserIcon}
                label={tr('profile.viewProfile')}
                onPress={openProfile}
              />
              <PeekAction
                icon={CameraIcon}
                label={tr('profile.changePhoto')}
                onPress={changePhoto}
              />
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </Modal>
  );
}
