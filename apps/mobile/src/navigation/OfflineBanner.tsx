/**
 * Offline banner (§M13/§M21). A thin, calm strip under the header whenever the app is
 * offline — either the user's flight-mode toggle or a real network drop. WhatsApp-style
 * "waiting for network" reassurance; the app keeps working from local state.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme';
import { Text } from '../design-system';
import { useConnectivity } from '../core';

export function OfflineBanner(): React.JSX.Element | null {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const flightMode = useConnectivity(s => s.flightMode);
  const online = useConnectivity(s => s.online);

  if (!flightMode && online) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.spacing.xs,
        paddingVertical: t.spacing.xs,
        paddingHorizontal: t.spacing.lg,
        backgroundColor: t.colors.bgSubtle,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.hairline,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: flightMode ? t.colors.brandFrom : t.colors.warning,
        }}
      />
      <Text variant="caption" color="secondary">
        {flightMode ? tr('common.flightMode') : tr('common.offline')}
      </Text>
    </View>
  );
}
