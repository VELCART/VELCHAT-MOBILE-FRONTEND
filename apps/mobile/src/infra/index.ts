/**
 * infra/ — LAYER: implementations of domain ports. Cannot import features/ or ui/.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { queryClient } from './network';
export { storage, kv, KVKeys } from './kv';
export { getBatteryStatus, getNetworkStatus, subscribeNetwork } from './native';
export type { BatteryStatus, NetworkStatus } from './native';
