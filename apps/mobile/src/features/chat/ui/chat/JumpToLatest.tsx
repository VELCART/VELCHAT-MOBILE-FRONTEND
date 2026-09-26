/**
 * Jump-to-latest FAB (§F2) — a small circular down-chevron that floats just above the
 * composer, shown only while the list is scrolled away from the newest message. Tap scrolls
 * back to the bottom. Subtle raised surface; monochrome. Visibility is owned by the parent.
 */
import React from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import { ChevronDownIcon } from '../../../../design-system';
import { chatPalette } from '../../model/chatPalette';

export function JumpToLatest({
  onPress,
}: {
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const c = chatPalette(t.scheme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('chat.jumpToLatest')}
      onPress={onPress}
      // 40dp of button + 6dp of slop clears the 44dp floor the tokens define.
      hitSlop={6}
      style={({ pressed }) => ({
        position: 'absolute',
        right: t.spacing.md,
        bottom: t.spacing.md,
        width: 40,
        height: 40,
        borderRadius: 20,
        // Same fill as an incoming bubble, so it reads as part of the thread and, unlike
        // `surface` + a hairline, is actually visible against a white wallpaper.
        backgroundColor: c.incomingBg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: c.bubbleBorder,
        opacity: pressed ? 0.8 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
      })}
    >
      <ChevronDownIcon size={24} color={c.incomingMeta} strokeWidth={2.2} />
    </Pressable>
  );
}
