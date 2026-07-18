/**
 * Reverse-OTP verify (§F1, §B2.2). The user gives a missed call (or SMS) to the
 * VelChat DID from their phone; the SIP gateway matches the CLI and provisions
 * the session server-side. Meanwhile we poll /auth/session and auto-advance when
 * tokens arrive. ₹0-cost, no OTP typing.
 */
import React, { useEffect } from 'react';
import {
  StatusBar,
  View,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../theme';
import { Screen, Text, PillButton, Column } from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import { useAuthStore } from '../model/authStore';
import { useSessionPolling } from '../hooks/useAuth';

// TODO(MP1): fetch the DID from backend config (REVOTP_DID) instead of a constant.
const VERIFY_DID = '+911140000000';

export function ReverseOtpScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const phone = useAuthStore(s => s.phone);
  const { verified, timedOut, begin, stop } = useSessionPolling();

  useEffect(() => {
    begin();
    return stop;
  }, [begin, stop]);

  useEffect(() => {
    if (verified) {
      navigation.reset({ index: 0, routes: [{ name: 'Notifications' }] });
    }
  }, [verified, navigation]);

  const giveMissedCall = (): void => {
    void Linking.openURL(`tel:${VERIFY_DID.replace(/[^\d+]/g, '')}`);
  };

  return (
    <Screen>
      <StatusBar
        barStyle={t.scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={{ flex: 1 }}>
        <Column gap={t.spacing.sm} style={{ marginTop: t.spacing.xxl }}>
          <Text variant="title">{tr('auth.otp.title')}</Text>
          <Text variant="body" color="secondary">
            {tr('auth.otp.subtitle', { phone: phone ?? '' })}
          </Text>
        </Column>

        <View
          style={{
            marginTop: t.spacing.xxl,
            padding: t.spacing.lg,
            borderRadius: t.radius.lg,
            backgroundColor: t.colors.bgSubtle,
          }}
        >
          <Text variant="caption" color="secondary">
            {tr('auth.otp.did')}
          </Text>
          <Text variant="title" style={{ marginTop: t.spacing.xs }}>
            {VERIFY_DID}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            marginTop: t.spacing.xl,
          }}
        >
          {!timedOut ? (
            <ActivityIndicator color={t.colors.textSecondary} />
          ) : null}
          <Text variant="caption" color={timedOut ? 'danger' : 'secondary'}>
            {timedOut ? tr('auth.otp.timeout') : tr('auth.otp.waiting')}
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <PillButton
          label={tr('auth.otp.missedCall')}
          onPress={giveMissedCall}
          leadingIcon="📞"
          style={{ marginBottom: t.spacing.md }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={timedOut ? begin : () => navigation.goBack()}
          style={{
            alignItems: 'center',
            paddingVertical: t.spacing.sm,
            marginBottom: t.spacing.lg,
          }}
        >
          <Text variant="caption" color="tertiary">
            {timedOut ? tr('auth.otp.retry') : tr('auth.otp.change')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
