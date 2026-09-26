/**
 * Chat header (§F2) — back chevron · circular peer avatar (initial letter for now) · name
 * with a reserved presence line (real presence is a follow-up; the row height stays stable)
 * · video-call, voice-call and overflow buttons. Surface background, hairline underline; the
 * top safe-area inset is owned by the parent Screen. Call/overflow are no-op stubs for now.
 */
import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import {
  Text,
  ChevronRightIcon,
  VideoIcon,
  CallIcon,
  MoreIcon,
  UserIcon,
  type IconProps,
} from '../../../../design-system';
import { useConversationIdentity } from '../../hooks/useConversationIdentity';
import {
  useChatHeaderPresence,
  type PresenceEntry,
} from '../../hooks/useChatHeaderPresence';
import {
  chatTitle,
  conversationRowIdentity,
  presenceTimeLabel,
} from './chatModel';
import { chatPalette } from '../../model/chatPalette';

const AVATAR = 40;

/**
 * Resolve the reserved presence-line text + colour: typing WINS (brand), else online / last-seen
 * from presence, else `null` (a blank spacer keeps the header height stable). Pure.
 */
function derivePresenceLine(
  typing: boolean,
  presence: PresenceEntry | undefined,
  tr: ReturnType<typeof useTranslation>['t'],
): { text: string | null; brand: boolean } {
  if (typing) return { text: tr('chat.typing'), brand: true };
  if (presence) {
    if (presence.status !== 'offline')
      return { text: tr('chat.online'), brand: false };
    if (presence.lastSeen !== null) {
      const time = presenceTimeLabel(
        presence.lastSeen,
        Date.now(),
        tr('chat.yesterday'),
      );
      return { text: tr('chat.lastSeen', { time }), brand: false };
    }
  }
  return { text: null, brand: false };
}

const noop = (): void => undefined;

/** Hoisted: a fresh object per render is a new prop identity for no reason. */
const DISABLED = { disabled: true } as const;
const ENABLED = { disabled: false } as const;

/**
 * A header action. `disabled` is the honest word for an UNBUILT one, and it is load-bearing:
 * a stub wired to `noop` but rendered with a real role, a real label and a press-dim says "I
 * did something" in the only vocabulary a button has, so the user reads a dead tap as the app
 * being broken and TalkBack announces a working control that is not. The composer's stubs were
 * fixed for exactly this (VC-059); the header's two call buttons were not.
 */
function HeaderIconButton({
  label,
  onPress,
  icon: Icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon: (props: IconProps) => React.JSX.Element;
  disabled?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled ? DISABLED : ENABLED}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed && !disabled ? 0.6 : 1,
      })}
    >
      <Icon size={23} color={t.colors.textPrimary} strokeWidth={2} />
    </Pressable>
  );
}

export function ChatHeader({
  conversationId,
  name,
  onBack,
  onOpenWallpaper,
}: {
  conversationId: string;
  name: string | undefined;
  onBack: () => void;
  /** Overflow (⋯) → the chat wallpaper picker (§F2). */
  onOpenWallpaper: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { typing, presence } = useChatHeaderPresence(conversationId);
  // The photo comes from the conversation row the inbox sync already resolved, so the header is
  // complete on the first frame instead of three round-trips after the tap. Stale entries are
  // revalidated in the background by the hook, and the row is observed, so a changed picture
  // appears without the user doing anything.
  const {
    peerAvatarUrl,
    name: rowName,
    resolved,
  } = useConversationIdentity(conversationId);
  const dp = peerAvatarUrl;
  // The notification deep link is `chat/:conversationId` and carries no name, so `name` is
  // undefined on that entry point and the header used to read "Chats" — the tab label — while
  // the avatar and presence line beside it were right (VC-053). The row already observed here
  // knows the peer; prefer it over the generic label.
  // A conversation nothing names is called what it IS, not what tab it came from. The fallback
  // here used to be `tabs.chats`, so an unidentified chat's header read "Chats" — a label, in
  // the slot where the person's name goes. That was the best available string when VC-053 was
  // written; the chat list has since needed the same answer and `chat.unknownContact` exists
  // for it (VC-070), so both surfaces say the same thing now.
  // "Unknown contact" is an ANSWER, and it must not be given before the question has been
  // asked. The local row arrives one emission after mount, so on the notification deep link —
  // the one entry point that carries no name — the header used to state, in words, that it did
  // not know who this was, and then replace that with the person's name a frame later. Until
  // the row has been read there is simply nothing to say, so it says nothing.
  const { title, initial } = conversationRowIdentity(
    chatTitle(name, rowName, ''),
    resolved ? tr('chat.unknownContact') : '',
  );
  const presenceLine = derivePresenceLine(typing, presence, tr);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 60,
        paddingLeft: t.spacing.xs,
        paddingRight: t.spacing.xs,
        // `bgBase`, NOT `surface`: the safe-area inset above this header is painted by `Screen`
        // (bgBase) and the home header uses bgBase too. In light both tokens are #FFFFFF so the
        // difference was invisible, but in dark `surface` is #1A1A1C against a #0A0A0B inset —
        // a visible seam under the status bar, and a chat header that did not match the home
        // header it was navigated from.
        backgroundColor: t.colors.bgBase,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.hairline,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('profile.back')}
        onPress={onBack}
        hitSlop={10}
        style={({ pressed }) => ({
          width: 36,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ transform: [{ rotate: '180deg' }] }}>
          <ChevronRightIcon
            size={26}
            color={t.colors.textPrimary}
            strokeWidth={2.2}
          />
        </View>
      </Pressable>

      <View
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: AVATAR / 2,
          marginRight: t.spacing.sm,
          backgroundColor: t.colors.bgSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {dp ? (
          <Image
            source={{ uri: dp }}
            style={{ width: AVATAR, height: AVATAR }}
            resizeMode="cover"
          />
        ) : initial ? (
          <Text variant="label" style={{ color: t.colors.textSecondary }}>
            {initial}
          </Text>
        ) : (
          <UserIcon size={22} color={t.colors.textTertiary} strokeWidth={2} />
        )}
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          variant="label"
          numberOfLines={1}
          style={{ fontSize: 17, color: t.colors.textPrimary }}
        >
          {title}
        </Text>
        {/* Reserved presence line (§A15/§C4): typing wins (brand), else online / last-seen, else a
            blank spacer so the header height never jumps. */}
        <Text
          variant="caption"
          numberOfLines={1}
          style={{
            fontSize: 12,
            lineHeight: 15,
            // Typing is the thread's one accent, green, the way WhatsApp draws it — the whole
            // point of the line is that it reads as live without being read.
            color: presenceLine.brand
              ? chatPalette(t.scheme).typing
              : t.colors.textTertiary,
          }}
        >
          {presenceLine.text ?? ' '}
        </Text>
      </View>

      <HeaderIconButton
        label={tr('chat.videoCall')}
        onPress={noop}
        icon={VideoIcon}
        disabled
      />
      <HeaderIconButton
        label={tr('chat.call')}
        onPress={noop}
        icon={CallIcon}
        disabled
      />
      <HeaderIconButton
        label={tr('chat.more')}
        onPress={onOpenWallpaper}
        icon={MoreIcon}
      />
    </View>
  );
}
