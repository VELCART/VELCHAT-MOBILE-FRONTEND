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
export {
  requestNotificationPermission,
  hasNotificationPermission,
} from './notifications';
export type { NotificationPermission } from './notifications';
export { hapticTick, hapticSelection } from './haptics';
export {
  requestCameraPermission,
  requestMicrophonePermission,
  requestContactsPermission,
  requestBluetoothPermission,
} from './permissions';
