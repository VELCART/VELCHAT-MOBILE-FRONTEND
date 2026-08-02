/**
 * Auth session token store (§M7, §L14). Backed by encrypted MMKV.
 * The device keypair + Keychain-derived MMKV key arrive in MP1; this is the
 * read/write surface the network client and auth feature share.
 */
import { kv, KVKeys } from '../kv';

export interface SessionTokens {
  access: string;
  refresh: string;
  /** device-key thumbprint bound to the refresh token (backend `cnfJkt`). */
  cnfJkt?: string;
  accountId?: string;
  deviceId?: string;
}

export function getAccessToken(): string | undefined {
  return kv.getString(KVKeys.accessToken);
}

export function getRefreshToken(): string | undefined {
  return kv.getString(KVKeys.refreshToken);
}

export function getCnfJkt(): string | undefined {
  return kv.getString(KVKeys.cnfJkt);
}

export function getDeviceId(): string | undefined {
  return kv.getString(KVKeys.deviceId);
}

export function getAccountId(): string | undefined {
  return kv.getString(KVKeys.accountId);
}

export function getTenantId(): string | undefined {
  return kv.getString(KVKeys.tenantId);
}

/** The signed-in user's own phone number (E.164), captured at sign-in. Used to seed the
 * region for normalizing local-format contacts and as the caller's discovery input. */
export function getPhone(): string | undefined {
  return kv.getString(KVKeys.phone);
}

export function hasSession(): boolean {
  return Boolean(getAccessToken());
}

export function setTokens(t: SessionTokens): void {
  kv.set(KVKeys.accessToken, t.access);
  kv.set(KVKeys.refreshToken, t.refresh);
  if (t.cnfJkt !== undefined) kv.set(KVKeys.cnfJkt, t.cnfJkt);
  if (t.accountId !== undefined) kv.set(KVKeys.accountId, t.accountId);
  if (t.deviceId !== undefined) kv.set(KVKeys.deviceId, t.deviceId);
}

export function clearSession(): void {
  kv.delete(KVKeys.accessToken);
  kv.delete(KVKeys.refreshToken);
  kv.delete(KVKeys.cnfJkt);
  kv.delete(KVKeys.accountId);
  kv.delete(KVKeys.deviceId);
}
