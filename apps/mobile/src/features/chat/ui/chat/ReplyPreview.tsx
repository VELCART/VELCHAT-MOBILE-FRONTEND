/**
 * The reply draft above the composer (§F2) — what WhatsApp shows between picking a message to
 * answer and sending the answer.
 *
 * It is the SAME quote panel that will end up inside the sent bubble (QuotedMessage), one size
 * up, so the user is looking at the thing they are about to send rather than at a preview of
 * it. The cross is the only way out, so it is a full 44dp target (§M18) even though the glyph
 * inside it is small.
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useTheme } from '../../../../theme';
import { useTranslation } from '../../../../i18n';
import { CloseIcon } from '../../../../design-system';
import { QuotedMessage } from './QuotedMessage';
import { chatPalette, quoteAccent } from '../../model/chatPalette';

export function ReplyPreview({
  author,
  preview,
  onCancel,
}: {
  author: string;
  preview: string;
  onCancel: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const c = chatPalette(t.scheme);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: t.spacing.xs,
        marginBottom: -t.spacing.xxs,
        paddingLeft: 0,
        paddingRight: t.spacing.xxs,
        paddingTop: t.spacing.xxs,
        paddingBottom: t.spacing.xxs + 6,
        borderTopLeftRadius: t.radius.sm,
        borderTopRightRadius: t.radius.sm,
        backgroundColor: c.inputBg,
      }}
    >
      <View style={{ flex: 1, paddingLeft: t.spacing.xxs }}>
        <QuotedMessage
          author={author}
          preview={preview}
          accent={quoteAccent(c, false)}
          background="transparent"
          previewColor={c.quoteTextOnIncoming}
          compact={false}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('chat.cancelReply')}
        onPress={onCancel}
        hitSlop={12}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <CloseIcon size={20} color={c.incomingMeta} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
