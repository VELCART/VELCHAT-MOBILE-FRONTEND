/**
 * features/contacts — feature slice. Shape: ui/ model/ api/ hooks/ db/. Only this index is public.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { useContacts } from './hooks/useContacts';
export type { Contact } from './api/contactsApi';
export { useDeviceContacts } from './hooks/useDeviceContacts';
export type {
  VelchatContact,
  InviteContact,
  DeviceContactsStatus,
} from './hooks/useDeviceContacts';
