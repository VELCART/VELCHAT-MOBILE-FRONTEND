/**
 * §M22 DoD: logging a token / phone / message content / email must be stripped.
 */
import { redact, scrubString } from '../redact';

test('sensitive keys are censored, safe keys preserved', () => {
  const out = redact({
    userId: 'u_123',
    token: 'abc.def.ghi',
    phone: '+15551234567',
    message: { text: 'hello secret' },
    nested: { refreshToken: 'r0t', keepMe: 'ok' },
  }) as Record<string, unknown>;

  expect(out.userId).toBe('u_123');
  expect(out.token).toBe('[REDACTED]');
  expect(out.phone).toBe('[REDACTED]');
  expect(out.message).toBe('[REDACTED]');
  expect((out.nested as Record<string, unknown>).refreshToken).toBe(
    '[REDACTED]',
  );
  expect((out.nested as Record<string, unknown>).keepMe).toBe('ok');
});

test('free-form strings scrub JWT, Bearer, email, phone', () => {
  const jwt = 'eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2';
  expect(scrubString(`t=${jwt}`)).not.toContain('eyJ');
  expect(scrubString('Authorization: Bearer abc.def-ghi_jkl')).toContain(
    '[REDACTED]',
  );
  expect(scrubString('mail a@b.com please')).not.toContain('a@b.com');
  expect(scrubString('ring +1 555 123 4567 now')).not.toContain('555');
});
