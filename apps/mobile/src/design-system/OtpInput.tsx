/**
 * OtpInput (§F1) — a themed N-box code field. A single transparent TextInput sits
 * over the boxes to capture keystrokes, SMS autofill (Android `sms-otp`), and taps;
 * the boxes are pure visuals. Auto-fires onComplete when the last digit lands.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Animated,
  View,
  TextInput,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';
import { Text } from './primitives';

function OtpCell({
  char,
  active,
  error,
}: {
  char: string;
  active: boolean;
  error: boolean;
}): React.JSX.Element {
  const t = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(char);

  useEffect(() => {
    if (char && char !== previous.current) {
      scale.setValue(0.72);
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 24,
        bounciness: 9,
      }).start();
    }
    previous.current = char;
  }, [char, scale]);

  const filled = char !== '';
  const borderColor = error
    ? t.colors.danger
    : active
      ? t.colors.brandFrom
      : filled
        ? t.colors.textPrimary
        : t.colors.hairline;

  return (
    <Animated.View
      style={{
        width: 46,
        height: 56,
        borderRadius: t.radius.md,
        borderWidth: active || filled ? 2 : 1.5,
        borderColor,
        backgroundColor: active ? t.colors.surface : t.colors.bgSubtle,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale }],
      }}
    >
      {filled ? (
        <Text variant="title">{char}</Text>
      ) : active ? (
        <View
          style={{
            width: 2,
            height: 22,
            borderRadius: 1,
            backgroundColor: t.colors.brandFrom,
          }}
        />
      ) : null}
    </Animated.View>
  );
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = false,
  onComplete,
  error = false,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
  error?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    Animated.sequence([
      Animated.timing(shakeX, {
        toValue: -7,
        duration: 42,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: 7,
        duration: 42,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: -4,
        duration: 42,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: 0,
        duration: 42,
        useNativeDriver: true,
      }),
    ]).start();
  }, [error, shakeX]);

  const handleChange = useCallback(
    (raw: string) => {
      const clean = raw.replace(/\D/g, '').slice(0, length);
      onChange(clean);
      if (clean.length === length) onComplete?.(clean);
    },
    [length, onChange, onComplete],
  );

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={style}>
      <Animated.View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          transform: [{ translateX: shakeX }],
        }}
      >
        {Array.from({ length }).map((_, i) => (
          <OtpCell
            key={i}
            char={value[i] ?? ''}
            active={focused && i === value.length}
            error={error}
          />
        ))}
      </Animated.View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        style={[StyleSheet.absoluteFill, { opacity: 0 }]}
      />
    </Pressable>
  );
}
