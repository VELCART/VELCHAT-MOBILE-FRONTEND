/**
 * OtpInput (§F1) — a themed N-box code field. A single transparent TextInput sits
 * over the boxes to capture keystrokes, SMS autofill (Android `sms-otp`), and taps;
 * the boxes are pure visuals. Auto-fires onComplete when the last digit lands.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';
import { Text } from './primitives';

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
  const t = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const handleChange = useCallback(
    (raw: string) => {
      const clean = raw.replace(/\D/g, '').slice(0, length);
      onChange(clean);
      if (clean.length === length) onComplete?.(clean);
    },
    [length, onChange, onComplete],
  );

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={[{ flexDirection: 'row', justifyContent: 'space-between' }, style]}
    >
      {Array.from({ length }).map((_, i) => {
        const char = value[i] ?? '';
        const isCurrent = focused && i === value.length;
        const filled = char !== '';
        const borderColor = error
          ? t.colors.danger
          : isCurrent
            ? t.colors.brandFrom
            : filled
              ? t.colors.textPrimary
              : t.colors.hairline;
        return (
          <View
            key={i}
            style={{
              width: 46,
              height: 56,
              borderRadius: t.radius.md,
              borderWidth: isCurrent || filled ? 2 : 1.5,
              borderColor,
              backgroundColor: t.colors.bgSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {filled ? (
              <Text variant="title">{char}</Text>
            ) : isCurrent ? (
              <View
                style={{
                  width: 2,
                  height: 22,
                  borderRadius: 1,
                  backgroundColor: t.colors.brandFrom,
                }}
              />
            ) : null}
          </View>
        );
      })}

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
