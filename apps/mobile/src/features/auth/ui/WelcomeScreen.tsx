/**
 * Welcome screen (§F1) — hero art, bold heading, muted subtitle, floating pill CTA.
 * A language selector pill sits at the top: tap it to open a bottom-sheet dropdown and
 * pick the app language before signing up. Staggered fade-in on mount. Locked to light.
 */
import React, { useState } from 'react';
import { StatusBar, View, Image, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation, useLanguage } from '../../../i18n';
import { useTheme } from '../../../theme';
import {
  Screen,
  Text,
  PillButton,
  Column,
  Divider,
  FadeInUp,
  BottomSheet,
  GlobeIcon,
  ChevronRightIcon,
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
  const { language, setLanguage, supported, names } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);

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
        <FadeInUp style={{ alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('welcome.chooseLanguage')}
            onPress={() => setLangOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.xs,
              paddingVertical: t.spacing.xs,
              paddingHorizontal: t.spacing.md,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.bgSubtle,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <GlobeIcon
              size={16}
              color={t.colors.textSecondary}
              strokeWidth={2}
            />
            <Text variant="caption" style={{ fontSize: 13 }}>
              {names[language]}
            </Text>
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <ChevronRightIcon
                size={14}
                color={t.colors.textSecondary}
                strokeWidth={2.4}
              />
            </View>
          </Pressable>
        </FadeInUp>

        <FadeInUp style={{ width: '100%', alignItems: 'center' }}>
          <Image
            source={HERO}
            resizeMode="contain"
            style={{ width: '100%', height: 380, marginTop: t.spacing.xs }}
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

      <BottomSheet visible={langOpen} onClose={() => setLangOpen(false)}>
        <View
          style={{
            paddingHorizontal: t.spacing.xl,
            paddingTop: t.spacing.xs,
            paddingBottom: t.spacing.sm,
          }}
        >
          <Text variant="title" align="center" style={{ fontSize: 20 }}>
            {tr('welcome.chooseLanguage')}
          </Text>
          <View style={{ marginTop: t.spacing.md }}>
            {supported.map((code, i) => {
              const active = code === language;
              return (
                <React.Fragment key={code}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setLanguage(code);
                      setLangOpen(false);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: t.spacing.md,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text
                      variant="body"
                      style={{
                        flex: 1,
                        color: active
                          ? t.colors.brandFrom
                          : t.colors.textPrimary,
                      }}
                    >
                      {names[code]}
                    </Text>
                    {active ? (
                      <Text
                        variant="label"
                        style={{ color: t.colors.brandFrom }}
                      >
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </View>
      </BottomSheet>
    </Screen>
  );
}
