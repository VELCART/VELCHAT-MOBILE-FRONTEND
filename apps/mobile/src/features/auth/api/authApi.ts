/**
 * Auth API (§F1, backend §B2 /auth). Thin typed wrappers over the shared axios
 * client — the response envelope is already unwrapped by the client interceptor.
 */
import { api } from '../../../infra';

export interface Tokens {
  accountId: string;
  deviceId: string;
  access: string;
  refresh: string;
  expiresIn: number;
}

export interface RegisterResult {
  sessionId: string;
  expiresIn: number;
}

export interface Challenge {
  nonce: string;
  expiresIn: number;
}

/** Start a Reverse-OTP session; server stashes device material keyed by sessionId. */
export async function register(
  phone: string,
  devicePubkeyBase64: string,
): Promise<RegisterResult> {
  const res = await api.post('/auth/register', {
    phone,
    platform: 'android',
    devicePubkeyBase64,
  });
  return res.data as RegisterResult;
}

/** Poll for provisioned tokens once the Reverse-OTP proof lands (missed-call / SMS). */
export async function fetchSession(sessionId: string): Promise<Tokens> {
  const res = await api.post('/auth/session', { sessionId });
  return res.data as Tokens;
}

/** Device-key login step 1: get a nonce to sign. */
export async function requestChallenge(deviceId: string): Promise<Challenge> {
  const res = await api.post('/auth/challenge', { deviceId });
  return res.data as Challenge;
}

/** Device-key login step 2: prove possession of the device key. */
export async function loginWithDeviceKey(
  deviceId: string,
  signature: string,
): Promise<Tokens> {
  const res = await api.post('/auth/login/device-key', { deviceId, signature });
  return res.data as Tokens;
}

/** Fallback: email magic-link. */
export async function magicBegin(
  email: string,
  devicePubkeyBase64: string,
): Promise<void> {
  await api.post('/auth/magic/begin', {
    email,
    platform: 'android',
    devicePubkeyBase64,
  });
}

export async function magicVerify(token: string): Promise<Tokens> {
  const res = await api.post('/auth/magic/verify', { token });
  return res.data as Tokens;
}
