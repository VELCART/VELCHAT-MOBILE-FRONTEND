/**
 * PII / secret redaction (§M22, §M19). Nothing sensitive ever reaches a log
 * sink: tokens, phone numbers, message content, emails, auth headers, keys.
 * Applied to every log payload before it is emitted.
 *
 * Hermes-safe (no lookbehind). Key-based redaction is primary; value-pattern
 * scrubbing is defense-in-depth for free-form message strings.
 */
const CENSOR = '[REDACTED]';
const MAX_DEPTH = 6;

// Keys whose values are always sensitive.
const SENSITIVE_KEY =
  /^(password|pass|pwd|token|access|accesstoken|refresh|refreshtoken|authorization|auth|otp|code|secret|apikey|api_key|privatekey|private_key|cnfjkt|content|text|body|message|caption|phone|phonenumber|msisdn|email|ciphertext|salt|passphrase|recoverykey|backupcode)$/i;

const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

export function scrubString(input: string): string {
  return input
    .replace(JWT_RE, CENSOR)
    .replace(BEARER_RE, `Bearer ${CENSOR}`)
    .replace(EMAIL_RE, CENSOR)
    .replace(PHONE_RE, CENSOR);
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || value === undefined || typeof value !== 'object')
    return value;
  if (depth >= MAX_DEPTH) return CENSOR;
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? CENSOR : redact(v, depth + 1);
  }
  return out;
}
