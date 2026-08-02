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

export function JumpToLatest({
  onPress,
}: {
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('chat.jumpToLatest')}
      onPress={onPress}
      style={({ pressed }) => ({
        position: 'absolute',
        right: t.spacing.md,
        bottom: t.spacing.md,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: t.colors.hairline,
        opacity: pressed ? 0.8 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
      })}
    >
      <ChevronDownIcon
        size={24}
        color={t.colors.textPrimary}
        strokeWidth={2.2}
      />
    </Pressable>
  );
}
