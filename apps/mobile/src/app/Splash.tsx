/**
 * Boot splash (§L2) — shown while the launch bootstrap decides the auth state
 * (stored session vs. silent device-key re-login vs. onboarding). Prevents an
 * onboarding→home flicker. Themed (light/dark).
 */
import React from 'react';
import { View, ActivityIndicator, Image } from 'react-native';
import { useTheme } from '../theme';
import { Text } from '../design-system';
import OWL_SPLASH from './assets/owl-splash.png';

export function Splash(): React.JSX.Element {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.bgBase,
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.spacing.xl,
      }}
    >
      <Image
        source={OWL_SPLASH}
        accessibilityLabel="VelChat"
        style={{ width: 132, height: 132 }}
        resizeMode="contain"
      />
      <Text variant="title" style={{ color: t.colors.textPrimary }}>
        VelChat
      </Text>
      <ActivityIndicator color={t.colors.textSecondary} />
    </View>
  );
}
