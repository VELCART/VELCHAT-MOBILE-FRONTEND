/**
 * SignIn landing (§F1) — the post-notifications page. The ChatHero (boy + floating
 * themed bubbles) sits up top; a warm two-line headline + subtitle sit below, and a
 * floating "Continue" CTA opens the phone→OTP bottom sheet. On a verified code we
 * reset into the app. Reverse-OTP (missed-call) is offered only when the `reverseOtp`
 * feature flag is on (currently OFF → the 2Factor OTP sheet is the sole path).
 */
import React, { useState } from 'react';
import {
  StatusBar,
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
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
import { featureFlags } from '../../../core/config/featureFlags';
import type { RootStackParamList } from '../../../navigation/types';
import { ChatHero } from './components/ChatHero';
import { PhoneOtpSheet } from './components/PhoneOtpSheet';

export function SignInScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { height } = useWindowDimensions();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Keep the hero bold but never let it crowd the message/CTA on shorter phones.
  const heroHeight = Math.min(470, Math.round(height * 0.5));
  const canGoBack = navigation.canGoBack();

  const onAuthenticated = (): void => {
    setSheetOpen(false);
    navigation.reset({ index: 0, routes: [{ name: 'AppTabs' }] });
  };

  return (
    <Screen>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={t.scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={{ flex: 1 }}>
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={({ pressed }) => ({
              position: 'absolute',
              top: t.spacing.xs,
              left: 0,
              zIndex: 10,
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.colors.bgSubtle,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.colors.hairline,
              transform: [{ scale: pressed ? 0.94 : 1 }],
              ...t.elevation.e1,
            })}
          >
            {/* Drawn chevron-left (no icon lib): a square's top+right borders, rotated. */}
            <View
              style={{
                width: 10,
                height: 10,
                borderTopWidth: 2.5,
                borderRightWidth: 2.5,
                borderColor: t.colors.textPrimary,
                transform: [{ rotate: '-135deg' }],
                marginLeft: 3,
              }}
            />
          </Pressable>
        ) : null}

        <ChatHero height={heroHeight} />

        <FadeInUp delay={140} style={{ marginTop: t.spacing.md }}>
          <Column gap={t.spacing.sm} align="center">
            <Text variant="display" align="center">
              {tr('signin.title')}
            </Text>
            <Text
              variant="body"
              color="secondary"
              align="center"
              style={{ maxWidth: 300, paddingHorizontal: t.spacing.sm }}
            >
              {tr('signin.subtitle')}
            </Text>
          </Column>
        </FadeInUp>

        <View style={{ flex: 1 }} />

        <FadeInUp delay={280} style={{ marginBottom: t.spacing.xxl }}>
          <PillButton
            label={tr('signin.cta')}
            onPress={() => setSheetOpen(true)}
            trailingIcon="→"
          />
        </FadeInUp>
      </View>

      <PhoneOtpSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAuthenticated={onAuthenticated}
        onUseAnotherWay={
          featureFlags.reverseOtp
            ? () => {
                setSheetOpen(false);
                navigation.navigate('EnterPhone');
              }
            : undefined
        }
      />
    </Screen>
  );
}
