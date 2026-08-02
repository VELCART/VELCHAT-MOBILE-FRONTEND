/**
 * Date separator (§F2) — a centred, pill-shaped chip ("Today" / "Yesterday" / "D MMM")
 * shown above the first message of each calendar day. Monochrome, subtle raised surface.
 */
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../../../theme';
import { Text } from '../../../../design-system';

function DateChipBase({ label }: { label: string }): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', marginVertical: t.spacing.sm }}>
      <View
        style={{
          paddingHorizontal: t.spacing.sm,
          paddingVertical: 4,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.bgSubtle,
          borderWidth: t.scheme === 'dark' ? 1 : 0,
          borderColor: t.colors.hairline,
        }}
      >
        <Text
          variant="caption"
          style={{ fontSize: 12, color: t.colors.textSecondary }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

export const DateChip = React.memo(DateChipBase);
