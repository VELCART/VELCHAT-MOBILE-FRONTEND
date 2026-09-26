/**
 * Chat wallpaper picker (§F2) — opened from the chat header's overflow button.
 *
 * Each option is its OWN wallpaper rendered small, with a bubble pair on top, so the choice is
 * made by looking rather than by reading three nouns. The tiles reuse `ChatWallpaper`, so a
 * preview can never drift from what the chat actually paints.
 */
import React, { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import { BottomSheet, Text } from '../../../../design-system';
import {
  WALLPAPERS,
  wallpaperPaint,
  type WallpaperId,
} from '../../model/wallpaper';
import { ChatWallpaper } from './ChatWallpaper';
import { chatPalette } from '../../model/chatPalette';

const TILE_HEIGHT = 104;

function PreviewTile({
  id,
  selected,
  onPick,
}: {
  id: WallpaperId;
  selected: boolean;
  onPick: (id: WallpaperId) => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const paint = wallpaperPaint(id, t.scheme);
  const chat = chatPalette(t.scheme);
  const label = tr(`chat.wallpaper.${id}`);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={() => onPick(id)}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.75 : 1 })}
    >
      <View
        style={{
          height: TILE_HEIGHT,
          borderRadius: t.radius.md,
          overflow: 'hidden',
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? t.colors.textPrimary : t.colors.hairline,
          justifyContent: 'flex-end',
          padding: 8,
          gap: 4,
        }}
      >
        <ChatWallpaper id={id} />
        {/* A received bubble and a sent one — the pair that has to stay readable. */}
        <View
          style={{
            alignSelf: 'flex-start',
            width: '62%',
            height: 13,
            borderRadius: 7,
            // The preview has to show the bubbles the chat will ACTUALLY draw, or the picker
            // is choosing between three pictures of a screen that does not exist.
            backgroundColor: paint.incomingTint ?? chat.incomingBg,
          }}
        />
        <View
          style={{
            alignSelf: 'flex-end',
            width: '52%',
            height: 13,
            borderRadius: 7,
            backgroundColor: chat.outgoingBg,
          }}
        />
      </View>
      <Text
        variant="caption"
        style={{
          marginTop: 6,
          textAlign: 'center',
          color: selected ? t.colors.textPrimary : t.colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function WallpaperSheet({
  visible,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: WallpaperId;
  onClose: () => void;
  onPick: (id: WallpaperId) => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();

  // Picking applies immediately and closes — there is nothing to confirm, and the change is
  // trivially reversible by picking another.
  const pick = useCallback(
    (id: WallpaperId) => {
      onPick(id);
      onClose();
    },
    [onPick, onClose],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: t.spacing.lg, paddingBottom: 8 }}>
        <Text variant="title" style={{ fontSize: 19 }}>
          {tr('chat.wallpaper.title')}
        </Text>
        <Text
          variant="caption"
          style={{ color: t.colors.textSecondary, marginTop: 2 }}
        >
          {tr('chat.wallpaper.subtitle')}
        </Text>

        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}
        >
          {WALLPAPERS.map(w => (
            <PreviewTile
              key={w.id}
              id={w.id}
              selected={w.id === current}
              onPick={pick}
            />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}
