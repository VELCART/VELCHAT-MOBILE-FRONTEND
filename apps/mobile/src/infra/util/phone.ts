/**
 * Phone-number normalization for contact discovery (§G2). Address-book numbers come in every
 * shape a human ever typed — `0 98…`, `(202) 555…`, spaces, dashes, a leading `00` — but the
 * OPRF match is byte-exact on the E.164 form (`+<cc><national>`). We normalize every number to
 * E.164 before blinding, using the user's OWN number to supply the default region for
 * local-format entries (a contact saved as `09812…` in an Indian address book is `+9198…`).
 *
 * Pure + synchronous (unit-tested): no I/O, no native calls. libphonenumber-js is JS-only.
 */
import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

/**
 * Normalize a raw address-book number to E.164 (`+<cc><national>`), or `null` if it can't be
 * parsed into a VALID number. `defaultRegion` fills in the country for numbers written in
 * local (national) format; numbers already in `+…` international form ignore it.
 */
export function toE164(
  raw: string,
  defaultRegion?: CountryCode,
): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = parsePhoneNumberFromString(raw, defaultRegion);
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch {
    // libphonenumber throws on some malformed inputs — treat as un-normalizable.
    return null;
  }
}

/**
 * The ISO region (e.g. `IN`, `US`) of an E.164 number — used to derive the default region for
 * normalizing the user's local-format contacts from their own number. `undefined` if unknown.
 */
export function regionFromE164(
  e164: string | undefined,
): CountryCode | undefined {
  if (!e164) return undefined;
  try {
    return parsePhoneNumberFromString(e164)?.country;
  } catch {
    return undefined;
  }
}
