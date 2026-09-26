/**
 * The quoted-reply block (§F2) — WhatsApp's own: a coloured left bar, the author's name in that
 * same colour, and one clamped line of what they said, on a panel a shade off its host.
 *
 * ONE component for both places it appears, because they are the same object at two sizes: the
 * panel inside a sent bubble, and the panel above the composer while you are writing the reply.
 * Two implementations would be two chances for them to disagree about the author's colour, which
 * is the single thing a reader uses to know who is being answered.
 */
import React from 'react';
import { View, Text as RNText } from 'react-native';
import { CHAT_FONT } from './chatType';

const BAR_WIDTH = 4;

export function QuotedMessage({
  author,
  preview,
  accent,
  background,
  previewColor,
  /** The composer's copy is roomier than the one squeezed into a bubble. */
  compact = true,
}: {
  author: string;
  preview: string;
  accent: string;
  background: string;
  previewColor: string;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: background,
        minHeight: compact ? 36 : 44,
      }}
    >
      <View style={{ width: BAR_WIDTH, backgroundColor: accent }} />
      <View
        style={{
          flex: 1,
          paddingHorizontal: 8,
          paddingVertical: compact ? 4 : 6,
          justifyContent: 'center',
        }}
      >
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: CHAT_FONT,
            fontSize: 13,
            lineHeight: 17,
            fontWeight: '600',
            color: accent,
          }}
        >
          {author}
        </RNText>
        <RNText
          numberOfLines={compact ? 1 : 2}
          style={{
            fontFamily: CHAT_FONT,
            fontSize: 13,
            lineHeight: 18,
            color: previewColor,
          }}
        >
          {preview}
        </RNText>
      </View>
    </View>
  );
}
