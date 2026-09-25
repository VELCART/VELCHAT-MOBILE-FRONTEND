/**
 * Should the first-run profile sheet open? Pure — no React, no I/O (§L1 style: the decision is
 * separated from the fetching so it can be unit-tested).
 *
 * Email is the completion signal, and it does NOT live in the directory profile: it is a
 * separately-verified identifier owned by the auth-service (`GET /auth/account`). The client
 * keeps a MMKV mirror of it, but that mirror is wiped on every sign-out, so right after a login
 * it is always empty — which is exactly when the gate used to decide, and why an account with a
 * perfectly good email got asked for one on every single login (VC-049).
 */

const hasEmail = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim() !== '';

export function shouldPromptForProfile(input: {
  /** The local MMKV mirror. Authoritative when present, but empty right after a sign-out. */
  mirroredEmail: string | null | undefined;
  /**
   * What the auth-service says. `undefined` means "no answer yet" — either still in flight or
   * unreachable. Both are a reason to WAIT rather than prompt: asking for an email the account
   * may already have (and which cannot be saved while offline anyway) is the defect, and the
   * gate re-checks on the next launch regardless.
   */
  accountEmail: string | null | undefined;
}): boolean {
  if (hasEmail(input.mirroredEmail)) return false;
  if (input.accountEmail === undefined) return false;
  return !hasEmail(input.accountEmail);
}
