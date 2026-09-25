/**
 * Composer (§F2) — a rounded subtle pill holding an emoji stub, a multiline input that grows
 * to ~5 lines, and attach/camera stubs; outside sits one circular brand button that is a mic
 * when the field is empty and a send arrow the moment there is text. Only send is wired (the
 * existing optimistic path); emoji / attach / camera / mic are no-op stubs for now.
 */
import React, { useCallback } from 'react';
import { View, TextInput, Pressable, type ViewStyle } from 'react-native';
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

/** Hoisted: a fresh object per render is a new prop identity for no reason. */
const DISABLED = { disabled: true } as const;
const ENABLED = { disabled: false } as const;
const PILL_ICON_STYLE: ViewStyle = {
  width: 34,
  height: 38,
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * One of the pill's inline controls. Every one of them is currently a stub, so this button is
 * DISABLED rather than merely inert (VC-059): it used to carry a real accessibility label and dip
 * to 0.6 on press, which is the whole vocabulary a button has for saying "I did something" — so a
 * sighted user read a dead tap as the app being broken, and TalkBack announced four buttons
 * without a hint that three of them do nothing.
 *
 * Only the TRUTH changes here, not the look: the icon, the 34x38 box and the full opacity are
 * exactly as they were. Whether an unbuilt control should be hidden or visibly greyed is a
 * product decision, and it has not been made.
 */
function PillIconButton({
  label,
  children,
  hidden,
}: {
  label: string;
  children: React.ReactNode;
  hidden?: boolean;
}): React.JSX.Element | null {
  if (hidden) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={DISABLED}
      disabled
      hitSlop={6}
      style={PILL_ICON_STYLE}
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
        // `huge` (48dp) looks over-generous and reads as a white band below the pill, but it is
        // LOAD-BEARING: the parent lifts this bar by `keyboardDidShow.endCoordinates.height`,
        // and under RN 0.86's Android edge-to-edge that value lands short of the keyboard the
        // user actually sees. Trimming it to `xs` (tried for VC-061) moved the pill 40dp down
        // and put it BEHIND the keyboard on a 3-button-nav device — measured on a CPH2643.
        // Until the lift itself is correct this padding is what keeps the input visible, so it
        // stays; the band is cosmetic and invisible against a light keyboard.
        paddingBottom: keyboardUp
          ? t.spacing.huge
          : Math.max(insets.bottom, t.spacing.xs),
        backgroundColor: 'transparent',
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
        <PillIconButton label={tr('chat.emoji')}>
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
        <PillIconButton label={tr('chat.attach')}>
          <PaperclipIcon
            size={22}
            color={t.colors.textTertiary}
            strokeWidth={2}
          />
        </PillIconButton>
        <PillIconButton label={tr('chat.camera')} hidden={hasText}>
          <CameraIcon size={22} color={t.colors.textTertiary} strokeWidth={2} />
        </PillIconButton>
      </View>

      {/* Send when there is text, and a mic that is not built yet when there is not — so the
          same circle is a working control half the time and a stub the other half. It reports
          which one it currently is instead of looking identical in both (VC-059). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasText ? tr('chat.send') : tr('chat.voice')}
        accessibilityState={hasText ? ENABLED : DISABLED}
        disabled={!hasText}
        onPress={onPrimary}
        style={({ pressed }) => ({
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: t.colors.brandFrom,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed && hasText ? 0.8 : 1,
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
