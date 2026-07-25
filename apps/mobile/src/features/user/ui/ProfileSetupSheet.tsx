/**
 * First-run profile sheet (§F1/§B3). Opens from home ONLY when the directory profile
 * has no display name yet (see useProfileGate). Collects name (required) + about
 * (optional) → PUT /users/:id/profile. Dismissable (drag / scrim) — it simply
 * re-appears next visit until a name is saved. Bundled Poppins, staggered entrance.
 */
import React, { useState } from 'react';
import { View, TextInput } from 'react-native';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import {
  BottomSheet,
  Text,
  PillButton,
  Column,
  FadeInUp,
  UserIcon,
} from '../../../design-system';
import { useSaveProfile } from '../hooks/useProfile';
import type { Profile } from '../api/userApi';

export function ProfileSetupSheet({
  visible,
  onDone,
  onClose,
}: {
  visible: boolean;
  onDone: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { save, saving, error } = useSaveProfile();
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [focused, setFocused] = useState<'name' | 'about' | null>(null);

  const canSave = name.trim().length >= 2 && !saving;
  const initial = name.trim().charAt(0).toUpperCase();

  const onSave = async (): Promise<void> => {
    const patch: Partial<Profile> = { displayName: name.trim() };
    const trimmedAbout = about.trim();
    if (trimmedAbout) patch.about = trimmedAbout;
    const ok = await save(patch);
    if (ok) onDone();
  };

  const fieldWrap = (active: boolean) =>
    ({
      borderWidth: 1.5,
      borderColor: active ? t.colors.brandFrom : t.colors.hairline,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.bgSubtle,
      paddingHorizontal: t.spacing.md,
    }) as const;
  const inputStyle = {
    fontFamily: t.typography.body.fontFamily,
    fontSize: 16,
    color: t.colors.textPrimary,
    paddingVertical: t.spacing.md,
  } as const;

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissable={!saving}>
      <View
        style={{
          paddingHorizontal: t.spacing.xl,
          paddingTop: t.spacing.xs,
          gap: t.spacing.lg,
        }}
      >
        <FadeInUp>
          <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: t.pastels.lavender,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {/* Avatar placeholder: the typed name's initial, else a person glyph.
                  SWAP POINT — drop an <Image source={photo}> or a Lottie view here
                  (keep the circular frame) when a real photo / animated avatar exists. */}
              {initial ? (
                <Text
                  variant="display"
                  style={{
                    fontSize: 32,
                    lineHeight: 38,
                    color: t.colors.brandFrom,
                  }}
                >
                  {initial}
                </Text>
              ) : (
                <UserIcon
                  size={38}
                  color={t.colors.brandFrom}
                  strokeWidth={2}
                />
              )}
            </View>
            <Column gap={t.spacing.xxs} align="center">
              <Text variant="title" align="center">
                {tr('profile.title')}
              </Text>
              <Text
                variant="body"
                color="secondary"
                align="center"
                style={{ maxWidth: 300 }}
              >
                {tr('profile.subtitle')}
              </Text>
            </Column>
          </View>
        </FadeInUp>

        <FadeInUp delay={90}>
          <View style={{ gap: t.spacing.md }}>
            <View>
              <Text
                variant="caption"
                color="secondary"
                style={{ marginBottom: t.spacing.xxs }}
              >
                {tr('profile.nameLabel')}
              </Text>
              <View style={fieldWrap(focused === 'name')}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  placeholder={tr('profile.namePlaceholder')}
                  placeholderTextColor={t.colors.textTertiary}
                  autoFocus
                  maxLength={40}
                  returnKeyType="next"
                  style={inputStyle}
                />
              </View>
            </View>

            <View>
              <Text
                variant="caption"
                color="secondary"
                style={{ marginBottom: t.spacing.xxs }}
              >
                {tr('profile.aboutLabel')}
              </Text>
              <View style={fieldWrap(focused === 'about')}>
                <TextInput
                  value={about}
                  onChangeText={setAbout}
                  onFocus={() => setFocused('about')}
                  onBlur={() => setFocused(null)}
                  placeholder={tr('profile.aboutPlaceholder')}
                  placeholderTextColor={t.colors.textTertiary}
                  maxLength={140}
                  style={inputStyle}
                />
              </View>
            </View>
          </View>
        </FadeInUp>

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <FadeInUp delay={160}>
          <PillButton
            label={tr('profile.save')}
            onPress={onSave}
            disabled={!canSave}
            loading={saving}
            trailingIcon="→"
          />
        </FadeInUp>
      </View>
    </BottomSheet>
  );
}
