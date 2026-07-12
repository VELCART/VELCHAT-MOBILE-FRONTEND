/**
 * Welcome screen (§F1) — matches the provided reference: avatar-orbit hero,
 * bold heading, muted subtitle, black pill CTA (both light & dark). The full
 * onboarding flow (EnterPhone -> ReverseOTP -> LinkPasskey -> NameYou) is MP1.
 */
import React from 'react';
import { StatusBar, View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from '../../../i18n';
import { useTheme, useThemeMode } from '../../../theme';
import { Screen, Text, PillButton, Column, AvatarOrbit } from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';

export function WelcomeScreen(): React.JSX.Element {
  const t = useTheme();
  const { mode, toggle } = useThemeMode();
  const { t: tr } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Screen>
      <StatusBar barStyle={t.scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ marginTop: t.spacing.xxl }}>
          <AvatarOrbit />
        </View>

        <Column gap={t.spacing.sm} align="center" style={{ marginTop: t.spacing.xxl }}>
          <Text variant="display" align="center">
            {tr('welcome.title')}
          </Text>
          <Text variant="body" color="secondary" align="center">
            {tr('welcome.subtitle')}
          </Text>
        </Column>

        <View style={{ flex: 1 }} />

        <View style={{ width: '100%' }}>
          <PillButton label={tr('welcome.cta')} onPress={() => navigation.navigate('AppTabs')} />
          <Pressable
            accessibilityRole="button"
            onPress={toggle}
            style={{ marginTop: t.spacing.md, alignItems: 'center', paddingVertical: t.spacing.xs }}
          >
            <Text variant="caption" color="tertiary">
              {tr('common.theme', { mode })}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
