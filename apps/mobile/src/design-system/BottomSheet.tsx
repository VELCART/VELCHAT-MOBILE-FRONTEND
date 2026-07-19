/**
 * BottomSheet (§M16 motion) — a smooth, dependency-free bottom sheet built on RN
 * core Animated + Modal + PanResponder (no reanimated/gorhom in the locked stack).
 *
 * - Spring slide-up on open, timed slide-down on close (native driver → 60fps off
 *   the JS thread).
 * - Grab the handle and drag DOWN to dismiss — the scrim fades in lock-step with
 *   the drag (opacity is derived from the sheet's position), so pulling it down
 *   feels continuous; past ~28% (or a flick) it closes, otherwise it springs back.
 * - Lifts above the keyboard so inputs stay visible.
 * - Honours the OS "reduce motion" setting by snapping instead of animating.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  View,
  PanResponder,
  Keyboard,
  Platform,
  StyleSheet,
  AccessibilityInfo,
  useWindowDimensions,
  type EmitterSubscription,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

const SCRIM_MAX = 0.55;

export function BottomSheet({
  visible,
  onClose,
  children,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** When false, tap-scrim / drag / back-button won't close (e.g. mid-request). */
  dismissable?: boolean;
}): React.JSX.Element | null {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(screenH);
  const [kbHeight, setKbHeight] = useState(0);

  // translateY drives everything: 0 = fully open, sheetHeight = fully hidden. The
  // scrim opacity is DERIVED from it, so dragging fades the backdrop continuously.
  const translateY = useRef(new Animated.Value(screenH)).current;
  const sheetH = useRef(screenH);
  const reduceMotion = useRef(false);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissableRef = useRef(dismissable);
  dismissableRef.current = dismissable;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => {
        if (active) reduceMotion.current = v;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const animateIn = useCallback(() => {
    translateY.setValue(sheetH.current);
    if (reduceMotion.current) {
      translateY.setValue(0);
      return;
    }
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 14,
      bounciness: 3,
    }).start();
  }, [translateY]);

  const animateOut = useCallback(
    (after: () => void) => {
      if (reduceMotion.current) {
        after();
        return;
      }
      Animated.timing(translateY, {
        toValue: sheetH.current,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) after();
      });
    },
    [translateY],
  );

  // Open → mount then run the entrance. Close → play the exit, then unmount.
  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else if (mounted) {
      animateOut(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (mounted && visible) animateIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Keep the sheet above the on-screen keyboard.
  useEffect(() => {
    const show: EmitterSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => setKbHeight(e.endCoordinates?.height ?? 0),
    );
    const hide: EmitterSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const requestClose = useCallback(() => {
    if (dismissableRef.current) closeRef.current();
  }, []);

  const springBack = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [translateY]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        dismissableRef.current &&
        g.dy > 6 &&
        Math.abs(g.dy) > Math.abs(g.dx * 1.4),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        // Past ~28% of the sheet, or a downward flick → dismiss; else spring back.
        if (g.dy > sheetH.current * 0.28 || g.vy > 0.6) {
          requestClose();
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: () => springBack(),
    }),
  ).current;

  if (!mounted) return null;

  const scrimOpacity = translateY.interpolate({
    inputRange: [0, Math.max(1, sheetHeight)],
    outputRange: [SCRIM_MAX, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={requestClose}
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#000000', opacity: scrimOpacity },
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={requestClose} />
        </Animated.View>

        <Animated.View
          onLayout={e => {
            const h = e.nativeEvent.layout.height;
            sheetH.current = h;
            setSheetHeight(h);
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            marginBottom: kbHeight,
            transform: [{ translateY }],
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            paddingBottom: insets.bottom + t.spacing.md,
            ...t.elevation.e3,
          }}
        >
          {/* Generous drag zone around the grab handle. */}
          <View
            {...pan.panHandlers}
            style={{
              alignItems: 'center',
              paddingTop: t.spacing.sm,
              paddingBottom: t.spacing.md,
            }}
          >
            <View
              style={{
                width: 44,
                height: 5,
                borderRadius: 999,
                backgroundColor: t.colors.hairline,
              }}
            />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
