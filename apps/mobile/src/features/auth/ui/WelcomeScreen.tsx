/**
 * Welcome screen (§F1) — hero = the provided orbit-of-people art (white bg, so it
 * blends into the white onboarding screen), bold heading, muted subtitle, floating
 * pill CTA with a trailing arrow. Staggered fade-in on mount. Locked to light.
 */
import React from 'react';
import { StatusBar, View, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../theme';
import {
  Screen,
  Text,
  PillButton,
  Column,
  FadeInUp,
} from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import { useRequestNotifications } from '../hooks/useAuth';
import HERO from './assets/wlcom_hero.png';

export function WelcomeScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { check } = useRequestNotifications();

  // Skip the notifications page only when permission is already granted; otherwise
  // (never asked OR denied) show it so the user can still turn notifications on.
  const onStart = async (): Promise<void> => {
    const granted = await check();
    navigation.navigate(granted ? 'SignIn' : 'Notifications');
  };

  return (
    <Screen>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <FadeInUp style={{ width: '100%', alignItems: 'center' }}>
          <Image
            source={HERO}
            resizeMode="contain"
            style={{ width: '100%', height: 400, marginTop: t.spacing.sm }}
          />
        </FadeInUp>

        <FadeInUp delay={120} style={{ width: '100%' }}>
          <Column
            gap={t.spacing.sm}
            align="center"
            style={{ marginTop: t.spacing.xxs }}
          >
            <Text variant="display" align="center">
              {tr('welcome.title')}
            </Text>
            <Text variant="body" color="secondary" align="center">
              {tr('welcome.subtitle')}
            </Text>
          </Column>
        </FadeInUp>

        <View style={{ flex: 1 }} />

        <FadeInUp
          delay={240}
          style={{ width: '95%', marginBottom: t.spacing.xxl }}
        >
          <PillButton
            label={tr('welcome.cta')}
            onPress={onStart}
            trailingIcon="→"
          />
        </FadeInUp>
      </View>
    </Screen>
  );
}
