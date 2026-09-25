/**
 * QA regression guard — the first-run profile sheet must not nag an account that already has
 * an email (VC-049).
 *
 * The email is NOT part of the directory profile: it is a separately-verified identifier owned
 * by the auth-service (`GET /auth/account`), mirrored into MMKV. The gate used to decide from
 * the LOCAL mirror alone, and the mirror is wiped on every sign-out — so the very first thing a
 * returning user saw, every single login, was a bottom sheet asking for an email the server had
 * on file all along. Dismissing it only lasted the session.
 */
import { shouldPromptForProfile } from '../profileGate';

describe('VC-049 — asking for an email the account already has', () => {
  it('never prompts when the local mirror already holds an email', () => {
    expect(
      shouldPromptForProfile({
        mirroredEmail: 'a@example.com',
        accountEmail: null,
      }),
    ).toBe(false);
  });

  it('the exact defect: the mirror is empty but the SERVER has an email', () => {
    expect(
      shouldPromptForProfile({
        mirroredEmail: null,
        accountEmail: 'a@example.com',
      }),
    ).toBe(false);
  });

  it('waits for the server to answer rather than prompting on an empty mirror', () => {
    // `undefined` = the account snapshot has not come back yet (or could not be reached).
    // Prompting here is what produced the every-login sheet: the mirror is always empty this
    // early, because sign-out wiped it and the answer is still in flight.
    expect(
      shouldPromptForProfile({ mirroredEmail: null, accountEmail: undefined }),
    ).toBe(false);
  });

  it('prompts only once the server has confirmed there is no email', () => {
    expect(
      shouldPromptForProfile({ mirroredEmail: null, accountEmail: null }),
    ).toBe(true);
  });

  it('treats a blank email on either side as no email at all', () => {
    expect(
      shouldPromptForProfile({ mirroredEmail: '   ', accountEmail: null }),
    ).toBe(true);
    expect(
      shouldPromptForProfile({ mirroredEmail: null, accountEmail: '' }),
    ).toBe(true);
  });
});
