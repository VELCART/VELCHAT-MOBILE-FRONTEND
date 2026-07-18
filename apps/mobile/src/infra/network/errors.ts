/**
 * Typed network errors (§M7, §L16). Every failed request is normalized to an
 * AppError so features never branch on raw Axios/HTTP shapes.
 */
import axios from 'axios';

export type AppErrorKind =
  | 'network' // no response (offline, DNS, timeout)
  | 'timeout'
  | 'auth' // 401/403 after refresh failed
  | 'rate_limit' // 429
  | 'server' // 5xx
  | 'client' // 4xx (validation, not-found, conflict…)
  | 'canceled'
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly statusCode: number | undefined;
  readonly code: string | undefined; // backend error.code
  readonly requestId: string | undefined;
  readonly retryable: boolean;

  constructor(
    kind: AppErrorKind,
    message: string,
    opts: {
      statusCode?: number | undefined;
      code?: string | undefined;
      requestId?: string | undefined;
      retryable?: boolean | undefined;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.requestId = opts.requestId;
    this.retryable =
      opts.retryable ??
      (kind === 'network' || kind === 'timeout' || kind === 'server');
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Map any thrown value (usually an AxiosError) to a typed AppError. */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (axios.isCancel(error)) {
    return new AppError('canceled', 'Request canceled', { retryable: false });
  }

  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return new AppError(
        'timeout',
        'The request timed out. Check your connection and try again.',
      );
    }
    const res = error.response;
    if (!res) {
      return new AppError(
        'network',
        "Can't reach VelChat right now. Check your connection.",
      );
    }
    const body = res.data as
      | { message?: string; error?: { code?: string }; requestId?: string }
      | undefined;
    const statusCode = res.status;
    const requestId =
      body?.requestId ?? (res.headers?.['x-request-id'] as string | undefined);
    const code = body?.error?.code;
    const message = body?.message ?? error.message;
    const kind: AppErrorKind =
      statusCode === 401 || statusCode === 403
        ? 'auth'
        : statusCode === 429
          ? 'rate_limit'
          : statusCode >= 500
            ? 'server'
            : 'client';
    return new AppError(kind, message, { statusCode, code, requestId });
  }

  return new AppError(
    'unknown',
    error instanceof Error ? error.message : 'Something went wrong',
  );
}
