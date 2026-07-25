/**
 * Boot sequence (§L2). Ordered, non-blocking startup work. Extended as each
 * subsystem lands: logger (ready), encrypted MMKV (sync-ready on first access),
 * WatermelonDB open + crypto init (MP1/MP2), network + realtime clients (deferred),
 * background workers (scheduled, not running features).
 */
import { log } from '../core';

let booted = false;

/** RN's global JS error hook (Hermes). Typed defensively — it's a runtime global. */
type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsShape {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
}

/**
 * Catch uncaught JS errors + unhandled promise rejections that React error
 * boundaries CANNOT see (they only catch render-phase errors). We log them via the
 * redacted logger and then defer to RN's default handler, so nothing crashes
 * silently and no raw error ever reaches a console (§L16).
 */
function installGlobalErrorHandlers(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShape })
    .ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      const e = error instanceof Error ? error : new Error(String(error));
      log.error('uncaught js error', {
        errorMessage: e.message,
        stack: e.stack ?? '',
        isFatal: Boolean(isFatal),
      });
      previous?.(error, isFatal);
    });
  }
}

export function bootstrap(): void {
  if (booted) return;
  booted = true;
  installGlobalErrorHandlers();
  // env is already in every log line via the logger's base fields.
  log.info('app boot');
}
