/**
 * Composer (§F2) — a rounded subtle pill holding an emoji stub, a multiline input that grows
 * to ~5 lines, and attach/camera stubs; outside sits one circular brand button that is a mic
 * when the field is empty and a send arrow the moment there is text. Only send is wired (the
 * existing optimistic path); emoji / attach / camera / mic are no-op stubs for now.
 */
import React, { useCallback } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import {
  SmileyIcon,
  PaperclipIcon,
  CameraIcon,
  MicIcon,
  SendIcon,
} from '../../../../design-system';

const INPUT_MAX_HEIGHT = 120;
const noop = (): void => undefined;

function PillIconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 34,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export function Composer({
  value,
  onChangeText,
  onSend,
  keyboardUp = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** When the keyboard is up, the parent already lifted us by its height — drop the
   * safe-area bottom pad so the bar sits flush above the keyboard (no gap). */
  keyboardUp?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const hasText = value.trim().length > 0;

  const onPrimary = useCallback(() => {
    if (hasText) onSend();
  }, [hasText, onSend]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: t.spacing.xs,
        paddingHorizontal: t.spacing.xs,
        paddingTop: t.spacing.xxs,
        paddingBottom: keyboardUp
          ? t.spacing.huge
          : Math.max(insets.bottom, t.spacing.xs),
        backgroundColor: t.colors.surface,
        borderTopWidth: 0,
        borderTopColor: t.colors.hairline,
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-end',
          minHeight: 46,
          paddingHorizontal: t.spacing.xs,
          borderRadius: t.radius.xl,
          backgroundColor: t.colors.bgSubtle,
        }}
      >
        <PillIconButton label={tr('chat.emoji')} onPress={noop}>
          <SmileyIcon size={23} color={t.colors.textTertiary} strokeWidth={2} />
        </PillIconButton>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={tr('chat.messagePlaceholder')}
          placeholderTextColor={t.colors.textTertiary}
          multiline
          style={{
            flex: 1,
            maxHeight: INPUT_MAX_HEIGHT,
            paddingHorizontal: t.spacing.xxs,
            paddingTop: 9,
            paddingBottom: 9,
            fontFamily: t.typography.body.fontFamily,
            fontSize: 16,
            lineHeight: 21,
            color: t.colors.textPrimary,
          }}
        />
        <PillIconButton label={tr('chat.attach')} onPress={noop}>
          <PaperclipIcon
            size={22}
            color={t.colors.textTertiary}
            strokeWidth={2}
          />
        </PillIconButton>
        <PillIconButton label={tr('chat.camera')} onPress={noop}>
          <CameraIcon size={22} color={t.colors.textTertiary} strokeWidth={2} />
        </PillIconButton>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasText ? tr('chat.send') : tr('chat.voice')}
        onPress={hasText ? onPrimary : noop}
        style={({ pressed }) => ({
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: t.colors.brandFrom,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {hasText ? (
          <SendIcon size={22} color={t.colors.actionFg} strokeWidth={2.4} />
        ) : (
          <MicIcon size={22} color={t.colors.actionFg} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  );
}
