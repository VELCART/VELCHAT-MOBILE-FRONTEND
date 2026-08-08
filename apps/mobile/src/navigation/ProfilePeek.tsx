/**
 * Profile peek (§F1) — long-press preview popup for the profile avatar with blurred backdrop.
 * Shows the photo enlarged with name and frosted glass action buttons:
 * - Tapping the photo opens full-screen ProfilePhotoViewerModal with WhatsApp-parity 3-action bottom bar.
 * - View profile / Change photo / Remove photo options.
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
  UserIcon,
  CameraIcon,
  TrashIcon,
  type IconProps,
} from '../design-system';
import {
  useProfileSummary,
  useAvatarPicker,
  ProfilePhotoViewerModal,
} from '../features/user';
import type { RootStackParamList } from './types';

const SIZE = 240;

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
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.5)',
        }}
      >
        <Icon size={24} color="#000" strokeWidth={2} />
      </View>
      <Text variant="caption" style={{ color: '#ffffff', fontSize: 13 }}>
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
  const { displayName, avatar } = useProfileSummary();
  const { pick, remove } = useAvatarPicker();
  const initial = (displayName ?? '').trim().charAt(0).toUpperCase();

  const [rendered, setRendered] = useState(visible);
  const [viewerOpen, setViewerOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      const a = Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6,
      });
      a.start();
      return () => a.stop();
    }
    const a = Animated.timing(anim, {
      toValue: 0,
      duration: 140,
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
    outputRange: [0.88, 1],
  });

  const openProfile = (): void => {
    onClose();
    navigation.navigate('Profile');
  };
  const changePhoto = (): void => {
    onClose();
    void pick();
  };
  const removePhoto = (): void => {
    onClose();
    void remove();
  };

  return (
    <>
      <Modal
        visible={rendered && !viewerOpen}
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
          {/* Blurred dark glass backdrop overlay */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: 'rgba(0, 0, 0, 0.82)',
                opacity: anim,
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
              {/* Avatar image container — press to open full-screen viewer */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('profile.viewProfile')}
                onPress={() => setViewerOpen(true)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
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
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    ...t.elevation.e2,
                  }}
                >
                  {avatar ? (
                    <Image
                      source={{ uri: avatar }}
                      style={{ width: SIZE, height: SIZE }}
                      resizeMode="cover"
                    />
                  ) : initial ? (
                    <Text
                      variant="display"
                      style={{
                        fontSize: 90,
                        lineHeight: 100,
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
              </Pressable>

              {/* Action buttons bar */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  gap: t.spacing.xl,
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
                {avatar ? (
                  <PeekAction
                    icon={TrashIcon}
                    label={tr('profile.removePhoto')}
                    onPress={removePhoto}
                  />
                ) : null}
              </View>
            </Animated.View>
          </View>
        </Pressable>
      </Modal>

      {/* Full Screen Photo Viewer Modal */}
      <ProfilePhotoViewerModal
        visible={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          onClose();
        }}
        imageUri={avatar ?? undefined}
        name={displayName ?? undefined}
        isSelf
        onMessage={() => {
          setViewerOpen(false);
          openProfile();
        }}
        onChangePhoto={() => {
          setViewerOpen(false);
          changePhoto();
        }}
      />
    </>
  );
}
