/**
 * Locale key-parity guard. Every locale MUST expose the SAME set of leaf keys — otherwise
 * a string added to one language silently English-fallbacks in the others (exactly how the
 * Arabic phone/OTP + sign-in strings went missing). Fails with the precise per-locale diff.
 */
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import ar from '../locales/ar.json';

type Json = Record<string, unknown>;

function flattenKeys(obj: Json, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenKeys(v as Json, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

describe('i18n locale parity', () => {
  const enKeys = flattenKeys(en as Json);

  it('hi has exactly the same keys as en', () => {
    expect(flattenKeys(hi as Json)).toEqual(enKeys);
  });

  it('ar has exactly the same keys as en', () => {
    expect(flattenKeys(ar as Json)).toEqual(enKeys);
  });
});
