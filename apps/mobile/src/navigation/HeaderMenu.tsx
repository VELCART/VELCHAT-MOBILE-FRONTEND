/**
 * Header overflow menu (§F1) — the WhatsApp-style dropdown that opens from the ⋮
 * button: a rounded card pinned top-right that springs in on open and fades back out
 * on close (kept mounted through the exit). Rows use a clean opacity press — no boxed
 * highlight — and a tap-anywhere scrim dismisses it.
 */
import React, { useEffect, useRef, useState } from 'react';
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
        speed: 20,
        bounciness: 6,
      }).start();
    } else if (rendered) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 130,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
            top: insets.top + 50,
            right: t.spacing.sm,
            opacity: anim,
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1],
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
                  opacity: pressed ? 0.45 : 1,
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
