/**
 * First-run profile sheet (§F1/§B3). Opens from home ONLY when the profile is
 * incomplete (see useProfileGate — no name / no email on file). A WhatsApp-style
 * multi-step form — Name → Email → About — where each step slides horizontally on
 * Next/Back OR a left/right swipe (with a haptic tick). Tap the avatar to pick a
 * photo (uploaded via the media API); the initial/person default stays otherwise.
 * Name + about + avatar → PUT /users/:id/profile; email captured (verified later).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Animated,
  Image,
  PanResponder,
  ActivityIndicator,
  AccessibilityInfo,
  useWindowDimensions,
  type ReturnKeyTypeOptions,
} from 'react-native';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import {
  BottomSheet,
  Text,
  PillButton,
  Column,
  Row,
  UserIcon,
  CameraIcon,
} from '../../../design-system';
import {
  useSaveProfile,
  useAvatarUpload,
  useProfileSummary,
  hapticTick,
} from '../hooks/useProfile';
import type { Profile } from '../api/userApi';

const STEP_COUNT = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const { width: screenW } = useWindowDimensions();
  const { save, saving, error } = useSaveProfile();
  const avatar = useAvatarUpload();
  const summary = useProfileSummary();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [about, setAbout] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const seeded = useRef(false);

  const stepW = screenW - t.spacing.xl * 2;
  const x = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const aboutRef = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => {
        if (active) reduceMotion.current = v;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Seed the form from what we already know the moment it opens. A returning user who
  // has a name but no email (e.g. the email mirror was lost on a reinstall) lands on
  // the email step with the name/about pre-filled — they only add the missing email.
  useEffect(() => {
    if (!visible) {
      seeded.current = false;
      return;
    }
    if (seeded.current) return;
    seeded.current = true;
    const existingName = summary.displayName?.trim() ?? '';
    const existingAbout = summary.about?.trim() ?? '';
    const existingEmail = summary.email?.trim() ?? '';
    if (existingName) setName(existingName);
    if (existingAbout) setAbout(existingAbout);
    if (existingEmail) setEmail(existingEmail);
    if (existingName && !existingEmail) setStep(1);
  }, [visible, summary.displayName, summary.about, summary.email]);

  // Slide to the active step (also re-syncs if the width changes, e.g. rotation).
  useEffect(() => {
    const to = -step * stepW;
    if (reduceMotion.current) {
      x.setValue(to);
      return undefined;
    }
    const a = Animated.spring(x, {
      toValue: to,
      useNativeDriver: true,
      speed: 16,
      bounciness: 3,
    });
    a.start();
    return () => a.stop();
  }, [step, stepW, x]);

  // Focus the current step's field once the slide has settled.
  useEffect(() => {
    const refs = [nameRef, emailRef, aboutRef];
    const id = setTimeout(() => refs[step]?.current?.focus(), 320);
    return () => clearTimeout(id);
  }, [step]);

  const emailValid = EMAIL_RE.test(email.trim());
  const emailHint = email.trim().length > 3 && !emailValid;
  const canProceed =
    step === 0 ? name.trim().length >= 2 : step === 1 ? emailValid : true;
  const isLast = step === STEP_COUNT - 1;

  const submit = useCallback(async (): Promise<void> => {
    const patch: Partial<Profile> = { displayName: name.trim() };
    const trimmedAbout = about.trim();
    if (trimmedAbout) patch.about = trimmedAbout;
    if (avatar.mediaId) patch.avatarMediaId = avatar.mediaId;
    const ok = await save(patch, email.trim());
    if (ok) onDone();
  }, [name, about, email, avatar.mediaId, save, onDone]);

  const next = useCallback((): void => {
    if (!canProceed || saving) return;
    hapticTick();
    if (isLast) {
      void submit();
      return;
    }
    setStep(s => Math.min(s + 1, STEP_COUNT - 1));
  }, [canProceed, saving, isLast, submit]);

  const back = useCallback((): void => {
    hapticTick();
    setStep(s => Math.max(0, s - 1));
  }, []);

  // Left/right swipe on the form → next/back (latest handlers via refs).
  const nextRef = useRef(next);
  nextRef.current = next;
  const backRef = useRef(back);
  backRef.current = back;
  const stepRef = useRef(step);
  stepRef.current = step;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderRelease: (_e, g) => {
        if (g.dx <= -40) nextRef.current();
        else if (g.dx >= 40 && stepRef.current > 0) backRef.current();
      },
    }),
  ).current;

  const initial = name.trim().charAt(0).toUpperCase();
  // Show the just-picked photo, else the user's EXISTING avatar (so a returning user
  // sees their current photo already in place — they only change it if they want to).
  const shownAvatar = avatar.localUri ?? summary.avatar;
  const inputStyle = {
    fontFamily: t.typography.body.fontFamily,
    fontSize: 18,
    color: t.colors.textPrimary,
    paddingVertical: t.spacing.sm,
  } as const;
  const underline = (fieldKey: string) =>
    ({
      borderBottomWidth: 1.5,
      borderBottomColor:
        focused === fieldKey ? t.colors.brandFrom : t.colors.hairline,
      marginTop: t.spacing.xl,
    }) as const;

  const stepFrame = { width: stepW, minHeight: 148 } as const;

  const field = (
    key: string,
    ref: React.RefObject<TextInput | null>,
    value: string,
    setValue: (v: string) => void,
    opts: {
      placeholder: string;
      keyboardType?: 'default' | 'email-address';
      autoCapitalize?: 'none' | 'sentences';
      returnKeyType?: ReturnKeyTypeOptions;
      maxLength?: number;
    },
  ): React.JSX.Element => (
    <View style={underline(key)}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={setValue}
        onFocus={() => setFocused(key)}
        onBlur={() => setFocused(null)}
        placeholder={opts.placeholder}
        placeholderTextColor={t.colors.textTertiary}
        keyboardType={opts.keyboardType ?? 'default'}
        autoCapitalize={opts.autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        returnKeyType={opts.returnKeyType ?? 'next'}
        maxLength={opts.maxLength}
        onSubmitEditing={next}
        style={inputStyle}
      />
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissable={!saving}>
      <View
        style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.xs }}
      >
        {/* Avatar — tap to pick a photo; shows the picked image, else the typed
            initial, else a person glyph. Camera badge signals it's tappable. */}
        <View style={{ alignItems: 'center', marginBottom: t.spacing.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('profile.addPhoto')}
            onPress={avatar.pick}
            hitSlop={8}
          >
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: t.colors.bgSubtle,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {shownAvatar ? (
                <Image
                  source={{ uri: shownAvatar }}
                  style={{ width: 76, height: 76 }}
                  resizeMode="cover"
                />
              ) : initial ? (
                <Text
                  variant="display"
                  style={{
                    fontSize: 30,
                    lineHeight: 36,
                    color: t.colors.brandFrom,
                  }}
                >
                  {initial}
                </Text>
              ) : (
                <UserIcon
                  size={36}
                  color={t.colors.brandFrom}
                  strokeWidth={2}
                />
              )}
              {avatar.uploading ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.28)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: t.colors.brandFrom,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: t.colors.bgBase,
              }}
            >
              <CameraIcon size={15} color="#FFFFFF" strokeWidth={2} />
            </View>
          </Pressable>
        </View>

        {/* Sliding step strip (also swipeable) */}
        <View {...pan.panHandlers} style={{ width: stepW, overflow: 'hidden' }}>
          <Animated.View
            style={{
              flexDirection: 'row',
              width: stepW * STEP_COUNT,
              transform: [{ translateX: x }],
            }}
          >
            <View style={stepFrame}>
              <Column gap={t.spacing.xxs}>
                <Text variant="title">{tr('profile.nameTitle')}</Text>
                <Text variant="body" color="secondary">
                  {tr('profile.nameSubtitle')}
                </Text>
              </Column>
              {field('name', nameRef, name, setName, {
                placeholder: tr('profile.namePlaceholder'),
                maxLength: 40,
              })}
            </View>

            <View style={stepFrame}>
              <Column gap={t.spacing.xxs}>
                <Text variant="title">{tr('profile.emailTitle')}</Text>
                <Text variant="body" color="secondary">
                  {tr('profile.emailSubtitle')}
                </Text>
              </Column>
              {field('email', emailRef, email, setEmail, {
                placeholder: tr('profile.emailPlaceholder'),
                keyboardType: 'email-address',
                autoCapitalize: 'none',
                maxLength: 80,
              })}
              {emailHint ? (
                <Text
                  variant="caption"
                  color="danger"
                  style={{ marginTop: t.spacing.xs }}
                >
                  {tr('profile.emailInvalid')}
                </Text>
              ) : null}
            </View>

            <View style={stepFrame}>
              <Column gap={t.spacing.xxs}>
                <Text variant="title">{tr('profile.aboutTitle')}</Text>
                <Text variant="body" color="secondary">
                  {tr('profile.aboutSubtitle')}
                </Text>
              </Column>
              {field('about', aboutRef, about, setAbout, {
                placeholder: tr('profile.aboutPlaceholder'),
                returnKeyType: 'done',
                maxLength: 140,
              })}
            </View>
          </Animated.View>
        </View>

        {/* Progress dots */}
        <Row gap={6} justify="center" style={{ marginTop: t.spacing.lg }}>
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <View
              key={i}
              style={{
                width: i === step ? 18 : 7,
                height: 7,
                borderRadius: 4,
                backgroundColor:
                  i === step ? t.colors.brandFrom : t.colors.hairline,
              }}
            />
          ))}
        </Row>

        {error || avatar.error ? (
          <Text
            variant="caption"
            color="danger"
            align="center"
            style={{ marginTop: t.spacing.sm }}
          >
            {error ?? avatar.error}
          </Text>
        ) : null}

        {/* Actions */}
        <Row
          gap={t.spacing.sm}
          align="center"
          style={{ marginTop: t.spacing.lg }}
        >
          {step > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('profile.back')}
              onPress={back}
              hitSlop={8}
              style={({ pressed }) => ({
                width: 52,
                height: 52,
                borderRadius: 26,
                borderWidth: 1.5,
                borderColor: t.colors.hairline,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
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
          <View style={{ flex: 1 }}>
            <PillButton
              label={isLast ? tr('profile.done') : tr('profile.next')}
              onPress={next}
              disabled={!canProceed}
              loading={saving}
              {...(isLast ? {} : { trailingIcon: '→' })}
            />
          </View>
        </Row>
      </View>
    </BottomSheet>
  );
}
