/**
 * Header overflow menu (§F1) — the WhatsApp-style dropdown that opens from the ⋮
 * button: a rounded card pinned top-right with menu rows, a fade-scale entrance from
 * the corner, and a tap-anywhere scrim to dismiss.
 */
import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Text, Card } from '../design-system';

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
}): React.JSX.Element {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return undefined;
    anim.setValue(0);
    const a = Animated.timing(anim, {
      toValue: 1,
      duration: 140,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [visible, anim]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Animated.View
          style={{
            position: 'absolute',
            top: insets.top + 50,
            right: t.spacing.sm,
            opacity: anim,
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1],
                }),
              },
            ],
          }}
        >
          <Card
            style={{ padding: t.spacing.xxs, minWidth: 188, maxWidth: 260 }}
          >
            {items.map(item => (
              <Pressable
                key={item.label}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: t.spacing.sm,
                  borderRadius: t.radius.sm,
                  backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
                })}
              >
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={{
                    fontSize: 15,
                    color: item.danger ? t.colors.danger : t.colors.textPrimary,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </Card>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
