/**
 * E.164 normalization (§G2) — the discovery match is byte-exact, so every human-entered form
 * of the same number must collapse to one canonical `+<cc><national>` token, and junk must be
 * rejected (not silently mis-normalized).
 */
import { toE164, regionFromE164 } from '../phone';

describe('toE164', () => {
  it('passes through a valid international number regardless of default region', () => {
    expect(toE164('+14155552671')).toBe('+14155552671');
    expect(toE164('+14155552671', 'IN')).toBe('+14155552671');
  });

  it('normalizes formatting (spaces, dashes, parens) to the same E.164', () => {
    const forms = ['+1 (415) 555-2671', '+1 415-555-2671', '+1 4155552671'];
    for (const f of forms) expect(toE164(f)).toBe('+14155552671');
  });

  it('resolves a local-format number using the default region', () => {
    // US national form → needs region to know the country code.
    expect(toE164('(415) 555-2671', 'US')).toBe('+14155552671');
    // Indian national form (leading 0 trunk prefix).
    expect(toE164('09811155502', 'IN')).toBe('+919811155502');
  });

  it('folds a 00 international prefix to + using the region IDD', () => {
    // `00` is a region-specific IDD (IN/GB/DE/… all use it) — the caller's region strips it.
    expect(toE164('0014155552671', 'IN')).toBe('+14155552671');
  });

  it('returns null for an un-parseable or invalid number', () => {
    expect(toE164('')).toBeNull();
    expect(toE164('   ')).toBeNull();
    expect(toE164('not a number')).toBeNull();
    expect(toE164('12345')).toBeNull();
    // Local form with no region to anchor the country code.
    expect(toE164('415 555 2671')).toBeNull();
  });
});

describe('regionFromE164', () => {
  it('recovers the ISO region from an E.164 number', () => {
    expect(regionFromE164('+14155552671')).toBe('US');
    expect(regionFromE164('+919811155502')).toBe('IN');
  });

  it('returns undefined for missing or unknown input', () => {
    expect(regionFromE164(undefined)).toBeUndefined();
    expect(regionFromE164('')).toBeUndefined();
    expect(regionFromE164('+9990000000')).toBeUndefined();
  });
});
