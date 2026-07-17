/**
 * Notifications-permission onboarding (§F1). The hero image is drawn full-width,
 * flush under a translucent status bar — its own pink->white background reaches
 * the screen edges (no seam), white bottom meets the white screen. Heading,
 * subtitle, and a floating pill CTA (bell icon) sit below. Staggered fade-in.
 */
import React from 'react';
import { StatusBar, View, Pressable, Image } from 'react-native';
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
import HERO from './assets/notif_hero.png';

export function NotificationsScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Screen padded={false} edges={['bottom']}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="dark-content"
      />

      <View style={{ flex: 1 }}>
        <FadeInUp>
          <Image source={HERO} style={{ width: '100%', height: 400 }} />
        </FadeInUp>

        <View
          style={{
            flex: 1,
            paddingHorizontal: t.spacing.xl,
            paddingBottom: t.spacing.lg,
          }}
        >
          <FadeInUp delay={120}>
            <Column
              gap={t.spacing.xs}
              align="center"
              style={{ marginTop: t.spacing.xl }}
            >
              <Text variant="title" align="center">
                {tr('notifications.title')}
              </Text>
              <Text
                variant="body"
                color="secondary"
                align="center"
                style={{ marginTop: t.spacing.md }}
              >
                {tr('notifications.subtitle')}
              </Text>
            </Column>
          </FadeInUp>

          <View style={{ flex: 1 }} />

          <FadeInUp delay={240}>
            <PillButton
              label={tr('notifications.cta')}
              onPress={() => navigation.navigate('AppTabs')}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('AppTabs')}
              style={{
                marginTop: t.spacing.lg,
                alignItems: 'center',
                paddingVertical: t.spacing.xs,
              }}
            >
              <Text variant="caption" color="tertiary">
                {tr('notifications.later')}
              </Text>
            </Pressable>
          </FadeInUp>
        </View>
      </View>
    </Screen>
  );
}
