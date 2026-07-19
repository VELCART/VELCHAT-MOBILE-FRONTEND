/**
 * Typed build-time environment config (§M4 core layer).
 *
 * Values are injected by react-native-config from the active flavor's
 * `.env.<flavor>` file at build time (dev / stage / prod). Fallbacks keep the
 * app functional in Jest (where the native module is absent) and as a safety net.
 */
import Config from 'react-native-config';

export type AppEnvName = 'dev' | 'stage' | 'prod';

export interface AppEnv {
  readonly name: AppEnvName;
  /** REST base URL (dev gateway). Android emulator -> host is 10.0.2.2. */
  readonly apiBaseUrl: string;
  /** WebSocket URL (realtime gateway via dev aggregator). */
  readonly wsUrl: string;
}

const rawName = Config.ENV;
const name: AppEnvName =
  rawName === 'stage' || rawName === 'prod' ? rawName : 'dev';

export const appEnv: AppEnv = {
  name,
  apiBaseUrl: Config.API_BASE_URL ?? 'http://10.191.109.135:8080',
  wsUrl: Config.WS_URL ?? 'ws://10.0.2.2:8080/ws',
};
