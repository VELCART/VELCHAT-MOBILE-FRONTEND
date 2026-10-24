/**
 * The hold-a-message sheet (§F2) — what a long press on a bubble opens.
 *
 * Reply, Copy, Delete, in that order: the one you reach for constantly first, the destructive
 * one last and furthest from the thumb's resting position.
 *
 * Copy is HIDDEN rather than disabled when the bubble has no text. A greyed row is still a row
 * — it takes space, TalkBack still reads it, and it invites a tap that can never do anything.
 * An action that cannot apply to this message does not belong in this message's sheet.
 *
 * Delete is destructive AND local, and it says both. "Delete" on your own message reads as an
 * unsend to every WhatsApp user alive; this is not one — there is no backend route for
 * delete-for-everyone yet — so the row carries a hint that spells out what actually happens,
 * worded more bluntly for your own messages, where the misunderstanding is costly.
 *
 * Chrome comes from the normal theme tokens, not `chatPalette`. The palette exists to keep
 * bubbles legible over a wallpaper; this sheet sits above the whole screen on the app's own
 * surface, so it should look like every other sheet in the app, in light and dark alike.
 */
import React from 'react';
import { View, Pressable, type ViewStyle } from 'react-native';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import {
  BottomSheet,
  Text,
  hitSlop,
  CopyIcon,
  ReplyIcon,
  TrashIcon,
  type IconProps,
} from '../../../../design-system';

const ICON_SIZE = 22;

/** One action. Static layout style so the 44dp target is assertable, and real. */
function ActionRow({
  label,
  hint,
  icon: Icon,
  tone,
  onPress,
}: {
  label: string;
  hint?: string;
  icon: (p: IconProps) => React.JSX.Element;
  tone: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();

  const row: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    // §M18: the whole row is the target, never just the icon.
    minHeight: hitSlop.minTarget,
    paddingVertical: t.spacing.xs,
    paddingHorizontal: t.spacing.lg,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(hint === undefined ? {} : { accessibilityHint: hint })}
      onPress={onPress}
      android_ripple={{ color: t.colors.hairline }}
      style={({ pressed }) => [row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon size={ICON_SIZE} color={tone} strokeWidth={1.9} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: tone }}>{label}</Text>
        {hint === undefined ? null : (
          <Text
            variant="caption"
            style={{ color: t.colors.textSecondary, marginTop: 1 }}
          >
            {hint}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export interface MessageActionsSheetProps {
  visible: boolean;
  /** Did this device send the message? Only changes how plainly delete disclaims an unsend. */
  mine: boolean;
  /** Is there body text worth copying? False hides the Copy row entirely. */
  canCopy: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

export function MessageActionsSheet({
  visible,
  mine,
  canCopy,
  onClose,
  onReply,
  onCopy,
  onDelete,
}: MessageActionsSheetProps): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();

  // The sheet dismisses itself after EVERY action, so no handler can leave it stranded open.
  // The hook behind copy/delete closes too; both are idempotent, and one owner forgetting is
  // the whole class of bug this removes.
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View
        accessibilityLabel={tr('chat.actions.title')}
        style={{ paddingBottom: t.spacing.xs }}
      >
        <ActionRow
          label={tr('chat.actions.reply')}
          icon={ReplyIcon}
          tone={t.colors.textPrimary}
          onPress={run(onReply)}
        />
        {canCopy ? (
          <ActionRow
            label={tr('chat.actions.copy')}
            icon={CopyIcon}
            tone={t.colors.textPrimary}
            onPress={run(onCopy)}
          />
        ) : null}
        <ActionRow
          label={tr('chat.actions.delete')}
          hint={tr(
            mine ? 'chat.actions.deleteHintMine' : 'chat.actions.deleteHint',
          )}
          icon={TrashIcon}
          tone={t.colors.danger}
          onPress={run(onDelete)}
        />
      </View>
    </BottomSheet>
  );
}
