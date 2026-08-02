/**
 * Private contact-discovery REST surface (§G2, discovery via the gateway). Thin,
 * typed wrappers over the shared axios `api` (Bearer + tenant + envelope-unwrap are
 * handled by the interceptor in client.ts). No crypto here — this layer only moves
 * opaque base64url blinded points / hex tokens over the wire.
 *
 * Backend caps (enforced client-side to fail fast before a round-trip):
 *   - evaluate: ≤ 2000 blinded points / call, 5 calls / hour / account
 *   - match:    ≤ 2000 tokens / call,        10 calls / hour / account
 * A repeated 429 surfaces as AppError kind 'rate_limit' (the axios interceptor
 * honours Retry-After once, then normalizes) — the orchestrator handles it.
 *
 * PRIVACY: `blinded[]` are RSA-blinded points (server can't unblind → never sees a
 * number); `token`/`tokens[]` are OPRF outputs, not phone numbers. Never log any of
 * these values or the caller's numbers.
 */
import { api } from './client';
import { AppError } from './errors';

/** Max blinded points per `/evaluate` call (backend batch cap). */
export const OPRF_EVALUATE_BATCH_CAP = 2000;
/** Max tokens per `/match` call (backend batch cap). */
export const OPRF_MATCH_BATCH_CAP = 2000;

/** `GET /discovery/oprf/key` response — RSA public key, base64url big-integers. */
export interface OprfKeyResponse {
  n: string;
  e: string;
  version: number;
}

/** `POST /discovery/oprf/evaluate` response — evaluated points, same order as sent. */
export interface OprfEvaluateResponse {
  version: number;
  evaluated: string[];
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError('server', `discovery: malformed OPRF key (${field})`);
  }
  return value;
}

/** Fetch the server's RSA-OPRF public key `{ n, e, version }` (base64url). */
export async function getOprfKey(): Promise<OprfKeyResponse> {
  const res = await api.get('/discovery/oprf/key');
  const body = res.data as Partial<OprfKeyResponse> | undefined;
  const version = body?.version;
  if (typeof version !== 'number') {
    throw new AppError('server', 'discovery: malformed OPRF key (version)');
  }
  return {
    n: assertString(body?.n, 'n'),
    e: assertString(body?.e, 'e'),
    version,
  };
}

/**
 * Blind-evaluate a batch (≤ {@link OPRF_EVALUATE_BATCH_CAP}). The server applies its
 * secret exponent to each blinded point; `evaluated[]` is returned in the SAME ORDER.
 * Pass `keyVersion` so the server evaluates under the key the client blinded against.
 */
export async function oprfEvaluate(
  accountId: string,
  blinded: string[],
  keyVersion?: number,
): Promise<OprfEvaluateResponse> {
  if (blinded.length > OPRF_EVALUATE_BATCH_CAP) {
    throw new AppError(
      'client',
      `discovery: evaluate batch exceeds cap (${blinded.length} > ${OPRF_EVALUATE_BATCH_CAP})`,
    );
  }
  const body: { accountId: string; blinded: string[]; keyVersion?: number } =
    keyVersion === undefined
      ? { accountId, blinded }
      : { accountId, blinded, keyVersion };
  const res = await api.post('/discovery/oprf/evaluate', body);
  const data = res.data as Partial<OprfEvaluateResponse> | undefined;
  if (!Array.isArray(data?.evaluated) || typeof data?.version !== 'number') {
    throw new AppError('server', 'discovery: malformed evaluate response');
  }
  return { version: data.version, evaluated: data.evaluated };
}

/**
 * Register the caller's OWN OPRF token so others can discover them (opt-in). Idempotent
 * server-side. `keyVersion` must match the key the token was derived under.
 */
export async function oprfRegister(
  accountId: string,
  token: string,
  keyVersion: number,
): Promise<void> {
  await api.put('/discovery/oprf/register', { accountId, token, keyVersion });
}

/**
 * Look up which of `tokens` (≤ {@link OPRF_MATCH_BATCH_CAP}) belong to a registered
 * account. Returns a `token → accountId` map (only the tokens that matched).
 */
export async function oprfMatch(
  accountId: string,
  tokens: string[],
): Promise<Record<string, string>> {
  if (tokens.length > OPRF_MATCH_BATCH_CAP) {
    throw new AppError(
      'client',
      `discovery: match batch exceeds cap (${tokens.length} > ${OPRF_MATCH_BATCH_CAP})`,
    );
  }
  const res = await api.post('/discovery/oprf/match', { accountId, tokens });
  const data = res.data as { matches?: Record<string, string> } | undefined;
  return data?.matches ?? {};
}
