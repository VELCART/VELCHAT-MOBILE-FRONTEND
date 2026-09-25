/**
 * Axios API client (§M7, §L3) — the single HTTP surface for the app.
 *   request : Bearer token + tenant + request-id + client-version headers
 *   response: unwrap the backend `{ success, statusCode, message, data, requestId }` envelope
 *   errors  : normalize to AppError; single-flight 401 refresh + retry;
 *             backoff retry on network/timeout/5xx; honor 429 Retry-After
 * DPoP note: this backend binds refresh via `cnfJkt` only — there is NO per-request
 * proof header (see docs/backend-integration-reference.md).
 */
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { appEnv, log, isFlightMode } from '../../core';
import { AppError, normalizeError } from './errors';
import {
  getAccessToken,
  getRefreshToken,
  getTenantId,
  setTokens,
  clearSession,
  type SessionTokens,
} from './tokens';
import { cnfJktThumbprint } from '../crypto/deviceKey';
import { warmTargets } from './warmup';

const CLIENT_VERSION = '0.0.1';
// 60s tolerates Render free-tier cold-starts (a sleeping service takes ~40-50s to
// wake on the first request — measured 44s); warm requests return in <1s.
const DEFAULT_TIMEOUT = 60000;
const MAX_RETRIES = 2;

/**
 * How long a wake request is allowed to own a socket.
 *
 * A warm-up only has to ARRIVE — Render's router is always up and starts the sleeping instance
 * on receipt, so waiting for the reply buys nothing we read. Without a bound this waits for it
 * anyway: React Native's OkHttp client ships with no default read timeout, so each of these
 * would hold a connection for the full 30-50s wake on the launch path of the reference device,
 * unowned and undisposable (§M20.3). Generous enough that a slow handshake still gets the
 * request onto the wire, which is the part that matters.
 */
const WARM_DEADLINE_MS = 10_000;

/**
 * Wake the backend at launch — where there is in fact something asleep to wake (§ops, VC-008).
 *
 * This used to fire three fixed pings at every launch in every flavor on the theory that it was
 * warming "gateway + auth" and the realtime host. It was not. `warmTargets` holds the whole of
 * the reasoning and the evidence; the short version is that only the dev Render flavor has
 * anything that hibernates, production is one always-running process behind one origin, and the
 * `/.well-known/jwks.json` ping that carried the "login path" label never reached identity at
 * all. On a production build this now sends nothing, which is the correct number of requests.
 *
 * Best-effort throughout: nothing here is awaited, every failure is swallowed, and sign-in and
 * the first render neither wait on it nor learn whether it happened.
 */
export function warmBackend(): void {
  // Diagnostic, and the reason this is still called unconditionally: `apiBaseUrl` is the one
  // launch fact the logger's base fields do not carry, and a stale or mis-baked .env pointing a
  // build at the wrong backend is otherwise invisible until every call times out (VC-035).
  log.info('backend base', { env: appEnv.name, apiBaseUrl: appEnv.apiBaseUrl });
  if (isFlightMode()) return;

  for (const url of warmTargets(appEnv)) {
    // Fire-and-forget, but not unowned: the abort is what disposes of the socket, and clearing
    // the timer on settle keeps a woken-fast instance from leaving a pending timer behind.
    const controller = new AbortController();
    const deadline: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      WARM_DEADLINE_MS,
    );
    void fetch(url, {
      method: 'GET',
      // `@types/node` reaches this workspace through a transitive dependency and its
      // `AbortController` global wins over the one React Native declares, so `controller.signal`
      // is typed as Node's `AbortSignal` while RN's `fetch` asks for RN's. At runtime there is
      // one object and RN provides both halves of it; only the .d.ts disagree. One narrow cast
      // is a smaller change than editing tsconfig `types` for a §M1 locked stack.
      signal: controller.signal as unknown as RequestInit['signal'],
    })
      .catch(() => undefined)
      .finally(() => clearTimeout(deadline));
  }
}

interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
  __didAuthRetry?: boolean;
  __t0?: number; // request start (ms) for the dev network trace
}

// ── dev network trace ────────────────────────────────────────────────────────
// A readable one-line API log straight to the Metro terminal (like a backend HTTP
// log) so you can watch requests without opening a debugger. DEV-only — compiled
// out of release builds; the structured pino logger still runs for real telemetry.
const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function statusColor(status?: number): string {
  if (!status) return ANSI.red;
  if (status < 300) return ANSI.green;
  if (status < 400) return ANSI.cyan;
  if (status < 500) return ANSI.yellow;
  return ANSI.red;
}

function traceReq(method?: string, url?: string): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console -- dev-only readable API trace in Metro
  console.log(
    `${ANSI.dim}→${ANSI.reset} ${ANSI.cyan}${(method ?? 'GET').toUpperCase()}${
      ANSI.reset
    } ${url ?? ''}`,
  );
}

function traceRes(
  status: number | undefined,
  method: string | undefined,
  url: string | undefined,
  startedAt: number | undefined,
  note?: string,
): void {
  if (!__DEV__) return;
  const ms = startedAt ? Date.now() - startedAt : undefined;
  const c = statusColor(status);
  // eslint-disable-next-line no-console -- dev-only readable API trace in Metro
  console.log(
    `${c}←${ANSI.reset} ${c}${status ?? 'ERR'}${ANSI.reset} ${(
      method ?? 'GET'
    ).toUpperCase()} ${url ?? ''} ${ANSI.dim}${ms ?? '?'}ms${
      note ? ` · ${note}` : ''
    }${ANSI.reset}`,
  );
}

function traceId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function backoffMs(attempt: number): number {
  const base = 300 * 2 ** attempt; // 300, 600, 1200…
  return base + Math.random() * base * 0.3;
}

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// A `Retry-After` header is server input, not a client budget — a legal, trivially injectable
// value like `86400` (24h) must never be allowed to park a request that long. This is the same
// order of magnitude as `DEFAULT_TIMEOUT` (a request the user is actively waiting on shouldn't
// sit idle far past what a timeout would already have ended), giving the UI a chance to show the
// wait/cooldown and move on rather than appearing hung (VC-034).
const MAX_RETRY_AFTER_MS = 10_000;

// --- single-flight refresh --------------------------------------------------
/**
 * Why this is a three-way outcome and not `string | null`:
 *
 * "the server refused this refresh token" and "we never reached the server" demand opposite
 * responses. The first means the session is genuinely over — sign out. The second means the
 * session is fine and the network isn't; destroying it there is how a sleeping free-tier
 * service, a VM that powers down at 19:30, or a tunnel turns into "the app logged me out".
 */
export type RefreshOutcome =
  /** The server issued fresh tokens; they are already persisted. */
  | { status: 'ok'; access: string }
  /** The server authoritatively refused (revoked/expired/malformed) — the session is over. */
  | { status: 'rejected' }
  /** We could not ask (offline, timeout, 5xx, rate-limited) — KEEP the session, retry later. */
  | { status: 'unavailable' };

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/** HTTP statuses that mean "this refresh token will never work again". Everything else the
 *  server can emit (5xx, 429, 408) is transient and must not cost the user their session. */
function isAuthoritativeRejection(status: number | undefined): boolean {
  return status === 400 || status === 401 || status === 403 || status === 422;
}

async function doRefresh(): Promise<RefreshOutcome> {
  const refresh = getRefreshToken();
  if (!refresh) return { status: 'rejected' };
  try {
    // bare axios (no interceptors) to avoid recursion
    const res = await axios.post(
      `${appEnv.apiBaseUrl}/auth/token/refresh`,
      { refreshToken: refresh, cnfJkt: cnfJktThumbprint() },
      {
        timeout: DEFAULT_TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    const data = (res.data?.data ?? res.data) as {
      access?: string;
      refresh?: string;
    };
    // A 200 with a body we can't use is a server-side anomaly, not proof the session died —
    // treat it as unavailable so a bad deploy can't sign every user out.
    if (!data?.access || !data?.refresh) {
      log.warn('token refresh returned an unusable body');
      return { status: 'unavailable' };
    }
    const next: SessionTokens = { access: data.access, refresh: data.refresh };
    const jkt = cnfJktThumbprint();
    if (jkt) next.cnfJkt = jkt;
    setTokens(next);
    return { status: 'ok', access: data.access };
  } catch (err) {
    const status = (err as AxiosError | undefined)?.response?.status;
    const rejected = isAuthoritativeRejection(status);
    log.warn('token refresh failed', {
      status,
      outcome: rejected ? 'rejected' : 'unavailable',
    });
    return rejected ? { status: 'rejected' } : { status: 'unavailable' };
  }
}

/** Single-flight refresh — concurrent 401s share one round-trip (never a refresh storm). */
export function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Convenience wrapper for callers that only need the token. Returns `null` for BOTH failure
 * modes, so anything that decides whether to END a session must use {@link refreshSession}
 * and check for `rejected` — a `null` here may only mean the network is down.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const outcome = await refreshSession();
  return outcome.status === 'ok' ? outcome.access : null;
}

// --- client -----------------------------------------------------------------
export const api: AxiosInstance = axios.create({
  baseURL: appEnv.apiBaseUrl,
  timeout: DEFAULT_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  config => {
    // Flight mode: don't touch the network at all — fail fast with a clean offline error.
    //
    // THROWN, not returned as a rejected Promise. In a `synchronous: true` interceptor axios
    // does not await the return value — it takes whatever comes back AS THE CONFIG and hands it
    // straight to `dispatchRequest` (see axios `lib/core/Axios.js`, the synchronous branch). A
    // returned rejection therefore became the request config: the caller got
    // `TypeError: Cannot read properties of undefined (reading 'toUpperCase')`, which
    // `normalizeError` cannot recognise as an AxiosError, so it degraded to a non-retryable
    // `unknown` and the outbox marked every queued message PERMANENTLY failed — a red bubble
    // where the user should have seen a pending clock. Only a throw reaches the interceptor's
    // own rejection path.
    if (isFlightMode()) {
      throw new AppError(
        'network',
        "You're offline (flight mode). Turn it off to reconnect.",
        { retryable: true },
      );
    }
    const token = getAccessToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    const tenant = getTenantId();
    if (tenant) config.headers.set('x-tenant-id', tenant);
    config.headers.set('x-request-id', traceId());
    config.headers.set('x-client-version', CLIENT_VERSION);
    (config as RetryConfig).__t0 = Date.now();
    traceReq(config.method, config.url);
    return config;
  },
  undefined,
  // VC-010: this body is synchronous top to bottom — it returns a config or THROWS, never a
  // Promise (see the flight-mode branch for what returning one cost). Without `synchronous:true` axios defers even a
  // fully synchronous interceptor into a microtask — so a caller that fires an authenticated
  // request and then synchronously clears the session on the very next line (sign-out's
  // best-effort revoke calls, issued "while the token is still valid") has that token deleted
  // before this interceptor ever reads it, and the request goes out unauthenticated. Declaring it
  // synchronous makes axios invoke it INLINE at the moment the request is issued, so it reads
  // whatever token was current at that exact call site — which is the whole point of issuing the
  // call before the clear.
  { synchronous: true },
);

api.interceptors.response.use(
  (res: AxiosResponse) => {
    const body: unknown = res.data;
    if (
      body &&
      typeof body === 'object' &&
      'success' in body &&
      'data' in body
    ) {
      res.data = (body as { data: unknown }).data;
    }
    traceRes(
      res.status,
      res.config.method,
      res.config.url,
      (res.config as RetryConfig).__t0,
    );
    return res;
  },
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    log.warn('http ✗', { url: config?.url, status, code: error.code });
    traceRes(status, config?.method, config?.url, config?.__t0, error.code);

    // 401 → refresh once, retry with the new token
    if (
      status === 401 &&
      config &&
      !config.__didAuthRetry &&
      getRefreshToken()
    ) {
      config.__didAuthRetry = true;
      const outcome = await refreshSession();
      if (outcome.status === 'ok') {
        config.headers.set('Authorization', `Bearer ${outcome.access}`);
        return api.request(config);
      }
      // ONLY an authoritative refusal ends the session. If the refresh could not reach the
      // server (offline, timeout, cold start, 5xx), the session is still valid — surface a
      // retryable error and let the user stay signed in.
      if (outcome.status === 'rejected') clearSession();
      return Promise.reject(normalizeError(error));
    }

    // Only replay IDEMPOTENT requests. A non-idempotent POST (OTP send/verify, createDm, OPRF
    // evaluate/match) must NEVER be auto-retried: the first attempt may have already taken
    // effect server-side even though the response was slow/lost on a cold start — replaying it
    // re-triggers the OTP mutex/cooldown or burns a rate-limit quota, surfacing as a spurious
    // 409/429. This (not the backend) was the "429 because the backend was waking up" cause.
    const method = (config?.method ?? 'get').toLowerCase();
    const idempotent =
      method === 'get' ||
      method === 'head' ||
      method === 'options' ||
      method === 'put' ||
      method === 'delete';

    // 429 → honor Retry-After once, idempotent requests only (retrying a rate-limited POST
    // just burns the quota again — surface it so the UI can show the wait/cooldown).
    if (status === 429 && config && !config.__retryCount && idempotent) {
      config.__retryCount = 1;
      const retryAfter = Number(error.response?.headers['retry-after']);
      const requestedMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : 1000;
      // Clamp to [0, MAX_RETRY_AFTER_MS]: a negative header waits not at all, a hostile or
      // merely huge one waits no longer than the ceiling above.
      const waitMs = Math.min(Math.max(requestedMs, 0), MAX_RETRY_AFTER_MS);
      await wait(waitMs);
      return api.request(config);
    }

    // network / timeout / 5xx → backoff retry, idempotent requests only.
    const retryable =
      idempotent &&
      (!error.response ||
        error.code === 'ECONNABORTED' ||
        (status !== undefined && status >= 500));
    if (config && retryable) {
      const attempt = (config.__retryCount ?? 0) + 1;
      if (attempt <= MAX_RETRIES) {
        config.__retryCount = attempt;
        await wait(backoffMs(attempt - 1));
        return api.request(config);
      }
    }

    return Promise.reject(normalizeError(error));
  },
);

export { AppError };
