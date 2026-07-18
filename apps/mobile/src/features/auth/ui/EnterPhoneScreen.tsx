/**
 * EnterPhone (§F1). Collects the phone number, provisions the device key, and
 * starts the Reverse-OTP session, then advances to the verify screen. Themed
 * (Poppins, pill CTA) to match onboarding.
 */
import React, { useState } from 'react';
import { StatusBar, View, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../theme';
import { Screen, Text, PillButton, Column, Row } from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import { useStartPhoneAuth } from '../hooks/useAuth';

export function EnterPhoneScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { start, loading, error } = useStartPhoneAuth();

  const [cc, setCc] = useState('91');
  const [number, setNumber] = useState('');

  const digits = number.replace(/\D/g, '');
  const valid = digits.length >= 8 && digits.length <= 14 && cc.length >= 1;

  const onContinue = async (): Promise<void> => {
    const phone = `+${cc.replace(/\D/g, '')}${digits}`;
    const ok = await start(phone);
    if (ok) navigation.navigate('ReverseOtp');
  };

  const inputStyle = {
    fontFamily: t.typography.body.fontFamily,
    fontSize: 18,
    color: t.colors.textPrimary,
    paddingVertical: t.spacing.md,
  } as const;

  return (
    <Screen>
      <StatusBar
        barStyle={t.scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={{ flex: 1 }}>
        <Column gap={t.spacing.sm} style={{ marginTop: t.spacing.xxl }}>
          <Text variant="title">{tr('auth.phone.title')}</Text>
          <Text variant="body" color="secondary">
            {tr('auth.phone.subtitle')}
          </Text>
        </Column>

        <Row
          gap={t.spacing.sm}
          align="center"
          style={{
            marginTop: t.spacing.xxl,
            borderBottomWidth: 1.5,
            borderBottomColor: t.colors.hairline,
          }}
        >
          <Text variant="body" style={{ fontSize: 18 }}>
            +
          </Text>
          <TextInput
            value={cc}
            onChangeText={v => setCc(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            style={[inputStyle, { width: 48 }]}
            maxLength={4}
          />
          <View
            style={{ width: 1, height: 24, backgroundColor: t.colors.hairline }}
          />
          <TextInput
            value={number}
            onChangeText={setNumber}
            keyboardType="phone-pad"
            placeholder={tr('auth.phone.placeholder')}
            placeholderTextColor={t.colors.textTertiary}
            autoFocus
            style={[inputStyle, { flex: 1 }]}
            maxLength={15}
          />
        </Row>

        {error ? (
          <Text
            variant="caption"
            color="danger"
            style={{ marginTop: t.spacing.md }}
          >
            {error}
          </Text>
        ) : null}

        <View style={{ flex: 1 }} />

        <PillButton
          label={tr('auth.phone.cta')}
          onPress={onContinue}
          disabled={!valid}
          loading={loading}
          trailingIcon="→"
          style={{ marginBottom: t.spacing.xxl }}
        />
      </View>
    </Screen>
  );
}
