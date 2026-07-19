/**
 * PhoneOtpSheet (§F1) — the auth bottom sheet. Two steps inside one smooth sheet:
 * enter phone → enter the 6-digit code. Wired to the 2Factor OTP flow (send → verify
 * → provision tokens). The code auto-verifies on the last digit.
 *
 * State PERSISTS across hide/show: once a code is requested, dragging the sheet away
 * and reopening returns to the OTP step with the live resend + expiry timers and the
 * "Change number" option intact — it never snaps back to phone entry. Only "Change
 * number" (or a fresh mount) resets to step 1. Timers are timestamp-based so they
 * stay accurate even while the sheet is hidden. Phone number is validated per country.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { useTranslation } from '../../../../i18n';
import { useTheme } from '../../../../theme';
import {
  BottomSheet,
  OtpInput,
  PillButton,
  Text,
  Column,
  Row,
  FadeInUp,
} from '../../../../design-system';
import { useOtpAuth } from '../../hooks/useAuth';

const OTP_LENGTH = 6;

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Country-aware validity: India (+91) = 10 digits starting 6-9; else generic E.164. */
function isValidPhone(ccDigits: string, numDigits: string): boolean {
  if (!ccDigits) return false;
  if (ccDigits === '91') return /^[6-9]\d{9}$/.test(numDigits);
  return numDigits.length >= 6 && numDigits.length <= 14;
}

export function PhoneOtpSheet({
  visible,
  onClose,
  onAuthenticated,
  onUseAnotherWay,
}: {
  visible: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
  /** Optional: fall back to the reverse-OTP (missed-call) method. */
  onUseAnotherWay?: (() => void) | undefined;
}): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { send, verify, sending, verifying, error, clearError } = useOtpAuth();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [cc, setCc] = useState('91');
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  // Timestamp-based timers (ms). 0 = inactive. `now` is ticked while on the OTP step.
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Tick every 500ms while a code is live — keeps the countdowns accurate even if the
  // sheet was hidden (they resume, they don't reset). NOTE: no reset-on-`visible`.
  useEffect(() => {
    if (step !== 'otp') return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [step]);

  const ccDigits = cc.replace(/\D/g, '');
  const digits = number.replace(/\D/g, '');
  const phone = `+${ccDigits}${digits}`;
  const phoneValid = isValidPhone(ccDigits, digits);
  const showPhoneHint = digits.length >= 6 && !phoneValid;
  const busy = sending || verifying;

  const resendLeft = resendAt
    ? Math.max(0, Math.ceil((resendAt - now) / 1000))
    : 0;
  const expiresLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - now) / 1000))
    : 0;
  const expired = expiresAt !== 0 && expiresLeft <= 0;

  const applyWindows = useCallback((resendAfter: number, expiresIn: number) => {
    const t0 = Date.now();
    setResendAt(t0 + resendAfter * 1000);
    setExpiresAt(t0 + expiresIn * 1000);
    setNow(t0);
  }, []);

  const startSend = useCallback(async (): Promise<void> => {
    const { ok, resendAfter, expiresIn } = await send(phone);
    if (ok) {
      setStep('otp');
      setCode('');
      applyWindows(resendAfter, expiresIn);
    }
  }, [send, phone, applyWindows]);

  const resend = useCallback(async (): Promise<void> => {
    if (resendLeft > 0 || sending) return;
    const { ok, resendAfter, expiresIn } = await send(phone);
    if (ok) {
      setCode('');
      clearError();
      applyWindows(resendAfter, expiresIn);
    }
  }, [resendLeft, sending, send, phone, applyWindows, clearError]);

  const changeNumber = useCallback((): void => {
    setStep('phone');
    setCode('');
    setResendAt(0);
    setExpiresAt(0);
    clearError();
  }, [clearError]);

  const runVerify = useCallback(
    async (c: string): Promise<void> => {
      if (c.length < OTP_LENGTH || expired) return;
      const ok = await verify(phone, c);
      if (ok) onAuthenticated();
    },
    [verify, phone, onAuthenticated, expired],
  );

  const inputStyle = {
    fontFamily: t.typography.body.fontFamily,
    fontSize: 18,
    color: t.colors.textPrimary,
    paddingVertical: t.spacing.sm,
  } as const;

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissable={!busy}>
      <View
        style={{
          paddingHorizontal: t.spacing.xl,
          paddingTop: t.spacing.sm,
          paddingBottom: t.spacing.md,
        }}
      >
        {step === 'phone' ? (
          <FadeInUp key="phone" distance={12} duration={320}>
            <Column gap={t.spacing.xs}>
              <Text variant="title">{tr('auth.sheet.phoneTitle')}</Text>
              <Text variant="body" color="secondary">
                {tr('auth.sheet.phoneSubtitle')}
              </Text>
            </Column>

            <Row
              gap={t.spacing.sm}
              align="center"
              style={{
                marginTop: t.spacing.xl,
                borderBottomWidth: 1.5,
                borderBottomColor: showPhoneHint
                  ? t.colors.danger
                  : t.colors.hairline,
                paddingBottom: t.spacing.xxs,
              }}
            >
              <Text variant="body" style={{ fontSize: 18 }}>
                +
              </Text>
              <TextInput
                value={cc}
                onChangeText={v => setCc(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                style={[inputStyle, { width: 44 }]}
                maxLength={4}
              />
              <View
                style={{
                  width: 1,
                  height: 24,
                  backgroundColor: t.colors.hairline,
                }}
              />
              <TextInput
                value={number}
                onChangeText={setNumber}
                keyboardType="phone-pad"
                placeholder={tr('auth.sheet.phonePlaceholder')}
                placeholderTextColor={t.colors.textTertiary}
                autoFocus
                style={[inputStyle, { flex: 1 }]}
                maxLength={15}
              />
            </Row>

            {showPhoneHint ? (
              <Text
                variant="caption"
                color="danger"
                style={{ marginTop: t.spacing.xs }}
              >
                {tr('auth.sheet.phoneInvalid')}
              </Text>
            ) : null}

            <PillButton
              label={tr('auth.sheet.sendCode')}
              onPress={startSend}
              disabled={!phoneValid}
              loading={sending}
              trailingIcon="→"
              style={{ marginTop: t.spacing.xl }}
            />

            {onUseAnotherWay ? (
              <Pressable
                accessibilityRole="button"
                onPress={onUseAnotherWay}
                style={{
                  alignItems: 'center',
                  paddingVertical: t.spacing.sm,
                  marginTop: t.spacing.xs,
                }}
              >
                <Text variant="caption" color="tertiary">
                  {tr('auth.sheet.anotherWay')}
                </Text>
              </Pressable>
            ) : null}
          </FadeInUp>
        ) : (
          <FadeInUp key="otp" distance={12} duration={320}>
            <Column gap={t.spacing.xs}>
              <Text variant="title">{tr('auth.sheet.otpTitle')}</Text>
              <Text variant="body" color="secondary">
                {tr('auth.sheet.otpSubtitle', { phone })}
              </Text>
            </Column>

            <OtpInput
              value={code}
              onChange={c => {
                setCode(c);
                if (error) clearError();
              }}
              onComplete={runVerify}
              error={Boolean(error) || expired}
              length={OTP_LENGTH}
              autoFocus
              style={{ marginTop: t.spacing.xl }}
            />

            {/* Expiry countdown (frontend-enforced, mirrors the backend window). */}
            <Text
              variant="caption"
              color={expired ? 'danger' : 'secondary'}
              style={{ marginTop: t.spacing.sm }}
            >
              {expired
                ? tr('auth.sheet.expired')
                : tr('auth.sheet.expiresIn', { time: mmss(expiresLeft) })}
            </Text>

            <PillButton
              label={tr('auth.sheet.verify')}
              onPress={() => runVerify(code)}
              disabled={code.length < OTP_LENGTH || expired}
              loading={verifying}
              style={{ marginTop: t.spacing.lg }}
            />

            <Row justify="space-between" style={{ marginTop: t.spacing.lg }}>
              <Pressable accessibilityRole="button" onPress={changeNumber}>
                <Text variant="caption" color="tertiary">
                  {tr('auth.sheet.changeNumber')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={resend}
                disabled={resendLeft > 0 || sending}
              >
                <Text
                  variant="caption"
                  color={resendLeft > 0 ? 'tertiary' : 'secondary'}
                >
                  {resendLeft > 0
                    ? tr('auth.sheet.resendIn', { time: mmss(resendLeft) })
                    : tr('auth.sheet.resend')}
                </Text>
              </Pressable>
            </Row>
          </FadeInUp>
        )}

        {error ? (
          <Text
            variant="caption"
            color="danger"
            style={{ marginTop: t.spacing.md }}
          >
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
