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
  secureStoreKey,
  secureStoreKeyCommitted,
  commitSecureStoreKey,
} from './secureStore';
export {
  requestCameraPermission,
  requestMicrophonePermission,
  requestContactsPermission,
  requestBluetoothPermission,
} from './permissions';
export {
  ensureContactsPermission,
  checkContactsPermission,
  readDeviceContacts,
} from './deviceContacts';
export type { DeviceContact, ContactsAccess } from './deviceContacts';
export { getAppState, subscribeAppState } from './appState';
export type { AppStateStatus } from './appState';
export { endpointHost, transportSecurityGap } from './transportSecurity';
export type {
  DomainPinPolicy,
  TransportSecurityGap,
} from './transportSecurity';
export {
  CLIPBOARD_AUTO_CLEAR_MS,
  clipboardClearPlan,
  copyWithAutoClear,
  disposeClipboardAutoClear,
} from './clipboard';
export { assessDeviceIntegrity, readDeviceIntegrity } from './deviceIntegrity';
export type {
  DeviceIntegritySignals,
  DeviceIntegritySignal,
} from './deviceIntegrity';
