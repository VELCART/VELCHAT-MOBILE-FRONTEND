/**
 * AuthMachine (§R1) as a Zustand store: signed_out | onboarding | verifying |
 * provisioning | active | locked | recovering. Persistent bits (tokens, account,
 * phone) live in encrypted MMKV; this store is the in-memory reflection + actions.
 */
import { create } from 'zustand';
import {
  hasSession,
  setTokens,
  clearSession,
  kv,
  KVKeys,
} from '../../../infra';
import type { Tokens } from '../api/authApi';

export type AuthState =
  | 'signed_out'
  | 'onboarding'
  | 'verifying'
  | 'provisioning'
  | 'active'
  | 'locked'
  | 'recovering';

interface AuthStore {
  readonly state: AuthState;
  readonly phone: string | null;
  readonly sessionId: string | null;
  readonly accountId: string | null;
  hydrate: () => void;
  beginVerify: (phone: string, sessionId: string) => void;
  provision: (tokens: Tokens) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>(set => ({
  state: hasSession() ? 'active' : 'signed_out',
  phone: kv.getString(KVKeys.phone) ?? null,
  sessionId: null,
  accountId: kv.getString(KVKeys.accountId) ?? null,

  hydrate: () => set({ state: hasSession() ? 'active' : 'signed_out' }),

  beginVerify: (phone, sessionId) => {
    kv.set(KVKeys.phone, phone);
    set({ phone, sessionId, state: 'verifying' });
  },

  provision: tokens => {
    setTokens({
      access: tokens.access,
      refresh: tokens.refresh,
      accountId: tokens.accountId,
      deviceId: tokens.deviceId,
    });
    kv.set(KVKeys.accountId, tokens.accountId);
    kv.set(KVKeys.deviceId, tokens.deviceId);
    set({ accountId: tokens.accountId, state: 'active' });
  },

  signOut: () => {
    clearSession();
    set({ state: 'signed_out', accountId: null, sessionId: null });
  },
}));
