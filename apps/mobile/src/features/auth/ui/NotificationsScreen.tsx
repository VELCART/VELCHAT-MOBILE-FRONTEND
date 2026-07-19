/**
 * Notifications-permission onboarding (§F1). The CTA fires the REAL OS permission
 * dialog (Android 13+ POST_NOTIFICATIONS); whatever the user picks, we advance to
 * sign-in. "Another time" skips the prompt and moves on. Staggered fade-in.
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
import { useRequestNotifications } from '../hooks/useAuth';
import HERO from './assets/notif_hero.png';

export function NotificationsScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { request, busy } = useRequestNotifications();

  // REPLACE (drop this screen from the back stack) so Back from SignIn lands on
  // Welcome. Whether permission is granted is re-checked at Welcome each entry.
  const goNext = (): void => {
    navigation.replace('SignIn');
  };

  const proceed = async (): Promise<void> => {
    await request(); // shows the system dialog; result doesn't gate the flow
    goNext();
  };

  return (
    <Screen padded={false} edges={['bottom']}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={t.scheme === 'dark' ? 'light-content' : 'dark-content'}
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
              onPress={proceed}
              loading={busy}
            />
            <Pressable
              accessibilityRole="button"
              onPress={goNext}
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
