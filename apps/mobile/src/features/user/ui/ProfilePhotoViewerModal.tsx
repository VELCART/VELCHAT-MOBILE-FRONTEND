/**
 * ProfilePhotoViewerModal — Full-screen WhatsApp-parity profile picture viewer (§F1).
 * Features:
 * - Full-screen black backdrop (#000000).
 * - Top header with back arrow, user name / "Profile photo", and options.
 * - Center full-size image preview with fallback initial avatar.
 * - Bottom action bar with 3 frosted-glass circular action buttons (Message, Call, Video Call)
 *   matching the popup style (60x60 glass disc with dark icon + white label).
 */
import React from 'react';
import {
  Modal,
  View,
  Pressable,
  Image,
  Dimensions,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import {
  Text,
  ChevronRightIcon,
  ChatIcon,
  CallIcon,
  VideoIcon,
  UserIcon,
  CameraIcon,
  type IconProps,
} from '../../../design-system';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function ActionButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.FC<IconProps>;
  label: string;
  onPress?: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
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
        <Icon size={24} color="#000000" strokeWidth={2} />
      </View>
      <Text
        variant="caption"
        style={{ color: '#ffffff', fontSize: 13, fontWeight: '500' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface ProfilePhotoViewerModalProps {
  visible: boolean;
  onClose: () => void;
  imageUri?: string | undefined;
  name?: string | undefined;
  isSelf?: boolean;
  onMessage?: () => void;
  onCall?: () => void;
  onVideoCall?: () => void;
  onChangePhoto?: () => void;
}

export function ProfilePhotoViewerModal({
  visible,
  onClose,
  imageUri,
  name,
  isSelf = false,
  onMessage,
  onCall,
  onVideoCall,
  onChangePhoto,
}: ProfilePhotoViewerModalProps): React.JSX.Element | null {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const initial = (name ?? '').trim().charAt(0).toUpperCase();
  const title = name ?? tr('profile.pageTitle');

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {/* Top Header Bar */}
        <View
          style={{
            paddingTop: insets.top,
            height: 56 + insets.top,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: t.spacing.xs,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 10,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('profile.back')}
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <ChevronRightIcon size={26} color="#ffffff" strokeWidth={2.2} />
            </View>
          </Pressable>

          <Text
            variant="title"
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 18,
              color: '#ffffff',
              marginLeft: t.spacing.xs,
            }}
          >
            {title}
          </Text>

          {isSelf && onChangePhoto ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('profile.changePhoto')}
              onPress={onChangePhoto}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <CameraIcon size={22} color="#ffffff" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {/* Center Full-Screen Image Preview */}
        <Pressable
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={onClose}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{
                width: SCREEN_WIDTH,
                height: SCREEN_HEIGHT * 0.6,
              }}
              resizeMode="contain"
            />
          ) : (
            <View
              style={{
                width: 220,
                height: 220,
                borderRadius: 110,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.15)',
              }}
            >
              {initial ? (
                <Text
                  variant="display"
                  style={{ fontSize: 88, color: 'rgba(255, 255, 255, 0.7)' }}
                >
                  {initial}
                </Text>
              ) : (
                <UserIcon
                  size={100}
                  color="rgba(255, 255, 255, 0.5)"
                  strokeWidth={1.6}
                />
              )}
            </View>
          )}
        </Pressable>

        {/* Bottom Action Bar — Frosted Glass Circular Discs matching ProfilePeek popup */}
        <View
          style={{
            paddingBottom: Math.max(insets.bottom, 20),
            paddingTop: 18,
            paddingHorizontal: t.spacing.xl,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255, 255, 255, 0.12)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
          }}
        >
          <ActionButton
            icon={ChatIcon}
            label={tr('tabs.chats')}
            onPress={onMessage ?? onClose}
          />
          <ActionButton
            icon={CallIcon}
            label={tr('chat.call')}
            onPress={onCall ?? onClose}
          />
          <ActionButton
            icon={VideoIcon}
            label={tr('chat.videoCall')}
            onPress={onVideoCall ?? onClose}
          />
        </View>
      </View>
    </Modal>
  );
}
