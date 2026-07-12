/**
 * infra/native — thin typed TS wrappers around each native module (§M23).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { getBatteryStatus } from './battery';
export type { BatteryStatus } from './battery';
export { getNetworkStatus, subscribeNetwork } from './network';
export type { NetworkStatus } from './network';
