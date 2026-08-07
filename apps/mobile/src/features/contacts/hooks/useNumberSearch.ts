/**
 * Search VelChat by phone number (§G2) — the WhatsApp "message a number that isn't saved"
 * flow. Normalizes the typed number to E.164 (region from the user's own number) and, on an
 * explicit tap (never per-keystroke — that would hammer the OPRF endpoint), blind-matches that
 * single number against the directory. Works with zero device contacts, so it's the answer on
 * a laptop/emulator too.
 *
 * feature-layer hook: may reach domain (discovery) + infra (phone/tokens); the UI calls it.
 */
import { useCallback, useMemo } from 'react';
import { getPhone, toE164, regionFromE164 } from '../../../infra';
import { discoverContacts } from '../../../domain';

export interface UseNumberSearch {
  /** Normalize a raw query to E.164 (own region), or null if it isn't a usable number / is me. */
  normalize: (raw: string) => string | null;
  /** Look one E.164 number up in the directory → matched accountId, or null if not on VelChat. */
  lookup: (e164: string) => Promise<string | null>;
}

export function useNumberSearch(): UseNumberSearch {
  const own = useMemo(() => {
    const raw = getPhone();
    const e164 = raw ? (toE164(raw) ?? raw) : undefined;
    return { e164, region: regionFromE164(e164) };
  }, []);

  const normalize = useCallback(
    (raw: string): string | null => {
      const c = toE164(raw, own.region);
      if (!c || c === own.e164) return null; // invalid, or the user's own number
      return c;
    },
    [own],
  );

  const lookup = useCallback(
    async (e164: string): Promise<string | null> => {
      if (!own.e164) return null;
      const map = await discoverContacts(own.e164, [e164]);
      return map.get(e164) ?? null;
    },
    [own],
  );

  return { normalize, lookup };
}
