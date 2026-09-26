/**
 * Composer (§F2) — a rounded subtle pill holding an emoji stub, a multiline input that grows
 * to ~5 lines, and attach/camera stubs; outside sits one circular brand button that is a mic
 * when the field is empty and a send arrow the moment there is text. Only send is wired (the
 * existing optimistic path); emoji / attach / camera / mic are no-op stubs for now.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Platform,
  type ViewStyle,
} from 'react-native';
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
import { ReplyPreview } from './ReplyPreview';
import { CHAT_FONT } from './chatType';
import { chatPalette } from '../../model/chatPalette';

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
  reply = null,
  onCancelReply,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** When the keyboard is up, the parent already lifted us by its height — drop the
   * safe-area bottom pad so the bar sits flush above the keyboard (no gap). */
  keyboardUp?: boolean;
  /** The message being answered, already resolved to display strings. `null` = a plain send. */
  reply?: {
    readonly author: string;
    readonly preview: string;
  } | null;
  onCancelReply?: (() => void) | undefined;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = chatPalette(t.scheme);
  const hasText = value.trim().length > 0;
  const inputRef = useRef<TextInput>(null);

  // The bottom inset AS MEASURED WITH THE KEYBOARD DOWN. Under Android edge-to-edge the
  // navigation-bar inset is reported as 0 while the keyboard is up (the bar is drawn over it),
  // so reading it at that moment gives the wrong answer for the very frame that needs it.
  const restingInset = useRef(insets.bottom);
  if (!keyboardUp && insets.bottom > 0) restingInset.current = insets.bottom;

  const onPrimary = useCallback(() => {
    if (hasText) onSend();
  }, [hasText, onSend]);

  // Picking a message to answer puts the caret in the box, the way it does in WhatsApp —
  // otherwise the swipe is followed by a second tap that does nothing but open the keyboard.
  // Keyed on whether a reply EXISTS, not on which one: re-targeting the reply while already
  // typing must not steal the caret from a half-written sentence.
  const replying = reply !== null;
  useEffect(() => {
    if (replying) inputRef.current?.focus();
  }, [replying]);

  const cancelReply = useCallback(() => onCancelReply?.(), [onCancelReply]);

  return (
    <View
      style={{
        paddingTop: t.spacing.xxs,
        // Why the bar needs extra padding at all while the keyboard is up:
        //
        // The parent lifts it by `keyboardDidShow.endCoordinates.height`, and under RN 0.86's
        // Android edge-to-edge that value lands SHORT of the keyboard the user actually sees —
        // short by exactly the navigation-bar inset. This padding is the difference. Trimming
        // it to `xs` (tried for VC-061) put the pill behind the keyboard on a CPH2643.
        //
        // It used to be the literal `huge` (48dp), which is the 3-button nav-bar height of that
        // one phone, applied everywhere. On gesture navigation (inset ~16-24dp) that left a
        // 24-32dp band of bare background above the keyboard, and on iOS — where
        // `keyboardWillShow` ALREADY includes the home-indicator area — a full 48dp band on
        // every device, every time anyone typed. The shortfall is an Android fact, so the
        // compensation is measured, and Android-only.
        paddingBottom: keyboardUp
          ? Platform.OS === 'android'
            ? restingInset.current
            : 0
          : Math.max(insets.bottom, t.spacing.xs),
        // A solid bar, not a transparent pane on `bgBase`. The wallpaper stops at the top of
        // this view, and against a tinted ground that boundary has to read as the edge of a
        // bar — which is what WhatsApp draws — rather than as a tint that ran out.
        backgroundColor: c.barBg,
      }}
    >
      {reply ? (
        <ReplyPreview
          author={reply.author}
          preview={reply.preview}
          onCancel={cancelReply}
        />
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.spacing.xs,
          paddingHorizontal: t.spacing.xs,
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
            backgroundColor: c.inputBg,
            borderWidth: 1,
            borderColor: c.inputBorder,
          }}
        >
          <PillIconButton label={tr('chat.emoji')}>
            <SmileyIcon size={23} color={c.inputPlaceholder} strokeWidth={2} />
          </PillIconButton>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={tr('chat.messagePlaceholder')}
            placeholderTextColor={c.inputPlaceholder}
            multiline
            style={{
              flex: 1,
              maxHeight: INPUT_MAX_HEIGHT,
              paddingHorizontal: t.spacing.xxs,
              paddingTop: 9,
              paddingBottom: 9,
              // The thread's face, not the app's display face — the box and the bubble it
              // becomes have to be the same typeface or the message visibly re-sets itself
              // the instant it is sent (see chatType.ts).
              fontFamily: CHAT_FONT,
              fontSize: 16,
              lineHeight: 21,
              color: c.inputText,
            }}
          />
          <PillIconButton label={tr('chat.attach')}>
            <PaperclipIcon
              size={22}
              color={c.inputPlaceholder}
              strokeWidth={2}
            />
          </PillIconButton>
          <PillIconButton label={tr('chat.camera')} hidden={hasText}>
            <CameraIcon size={22} color={c.inputPlaceholder} strokeWidth={2} />
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
    </View>
  );
}
