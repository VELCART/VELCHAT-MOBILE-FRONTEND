/**
 * Structured logger (§M22). pino, with the redaction pipeline applied to every
 * payload so no PII/secret ever reaches a sink. This is the ONLY sanctioned log
 * path — `console.*` is lint-banned everywhere else.
 */
import pino from 'pino';
import { redact, scrubString } from './redact';
import { appEnv } from '../config/env';

type Ctx = Record<string, unknown>;
type Level = 'debug' | 'info' | 'warn' | 'error';

function sink(entry: unknown): void {
  // Single controlled console usage — structured JSON, already redacted.
  // eslint-disable-next-line no-console
  console.log(typeof entry === 'string' ? entry : JSON.stringify(entry));
}

const pinoLogger = pino({
  level: appEnv.name === 'prod' ? 'info' : 'debug',
  browser: { asObject: true, write: sink },
  base: { app: 'velchat-mobile', env: appEnv.name },
});

function emit(level: Level, msg: string, ctx?: Ctx): void {
  const safeMsg = scrubString(msg);
  if (ctx) {
    pinoLogger[level](redact(ctx) as Ctx, safeMsg);
  } else {
    pinoLogger[level](safeMsg);
  }
}

export const log = {
  debug: (msg: string, ctx?: Ctx): void => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Ctx): void => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Ctx): void => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Ctx): void => emit('error', msg, ctx),
};

export type { Ctx as LogContext };
