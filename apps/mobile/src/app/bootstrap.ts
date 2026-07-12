/**
 * Boot sequence (§L2). Ordered, non-blocking startup work. Extended as each
 * subsystem lands: logger (ready), encrypted MMKV (sync-ready on first access),
 * WatermelonDB open + crypto init (MP1/MP2), network + realtime clients (deferred),
 * background workers (scheduled, not running features).
 */
import { log } from '../core';

let booted = false;

export function bootstrap(): void {
  if (booted) return;
  booted = true;
  // env is already in every log line via the logger's base fields.
  log.info('app boot');
}
