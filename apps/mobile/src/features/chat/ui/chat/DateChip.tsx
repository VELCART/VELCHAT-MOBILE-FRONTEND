/**
 * Date separator (§F2) — a centred pill ("Today" / "Yesterday" / "D MMM") above the first
 * message of each calendar day.
 *
 * It is drawn as a BUBBLE, not as a chrome chip: the same fill, the same edge, the same face
 * as the messages around it. It used to be `bgSubtle` with a border only in dark, which on the
 * `plain` light ground is #F7F7F8 on #FFFFFF — a shape with no edge at all — and on a
 * decorated wallpaper sat on the wash like a sticker, the exact problem the wallpaper model
 * documents and solves for bubbles.
 */
import React from 'react';
import { View, Text as RNText } from 'react-native';
import { useTheme } from '../../../../theme';
import { chatPalette } from '../../model/chatPalette';
import { CHAT_FONT } from './chatType';

function DateChipBase({
  label,
  tint = null,
}: {
  label: string;
  /** The wallpaper's incoming-bubble override, so the chip tracks the bubbles. */
  tint?: string | null;
}): React.JSX.Element {
  const t = useTheme();
  const c = chatPalette(t.scheme);
  return (
    <View style={{ alignItems: 'center', marginVertical: t.spacing.sm }}>
      <View
        style={{
          paddingHorizontal: t.spacing.sm,
          paddingVertical: 5,
          borderRadius: t.radius.pill,
          backgroundColor: tint ?? c.incomingBg,
          borderWidth: 1,
          borderColor: c.bubbleBorder,
        }}
      >
        <RNText
          style={{
            fontFamily: CHAT_FONT,
            fontSize: 12.5,
            lineHeight: 16,
            color: c.incomingMeta,
          }}
        >
          {label}
        </RNText>
      </View>
    </View>
  );
}

export const DateChip = React.memo(DateChipBase);
