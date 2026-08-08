/**
 * Header overflow menu (§F1) — WhatsApp-parity compact dropdown menu.
 * Pinned top-right with animated spring-in, fast smooth exit fade,
 * compact sizing, crisp hairline border, and zero shadows.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Text } from '../design-system';

export interface HeaderMenuItem {
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export function HeaderMenu({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: HeaderMenuItem[];
}): React.JSX.Element | null {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 28,
        bounciness: 2,
      }).start();
    } else if (rendered) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 100,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, rendered, anim]);

  if (!rendered) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Animated.View
          style={{
            position: 'absolute',
            top: insets.top + 46,
            right: 10,
            width: 170,
            backgroundColor: t.colors.surfaceElevated,
            borderRadius: 12,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: t.colors.hairline,
            opacity: anim,
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.94, 1],
                }),
              },
            ],
            shadowOpacity: 0,
            elevation: 0,
          }}
        >
          {items.map((item, idx) => (
            <Pressable
              key={`${item.label}-${idx}`}
              accessibilityRole="menuitem"
              accessibilityLabel={item.label}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed }) => ({
                paddingHorizontal: 16,
                paddingVertical: 9,
                backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
              })}
            >
              <Text
                variant="body"
                numberOfLines={1}
                style={{
                  fontSize: 14.5,
                  fontFamily: t.typography.body.fontFamily,
                  color: item.danger ? t.colors.danger : t.colors.textPrimary,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
