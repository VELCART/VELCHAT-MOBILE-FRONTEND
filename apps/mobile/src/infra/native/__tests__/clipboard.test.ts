/**
 * Clipboard auto-clear (VC-019, §A1).
 *
 * The Android clipboard is a process-wide, app-readable buffer with no expiry. Whatever the user
 * last copied — an OTP, a recovery phrase, a message body — sits there until something else
 * overwrites it, readable by any app that happens to be foregrounded. Clearing it on a timer is
 * the cheap half of the fix.
 *
 * The dangerous half is clearing the WRONG thing. Between the copy and the timer the user may
 * well have copied something else (a URL they are about to paste, a password from their
 * manager); wiping the clipboard at that point destroys data the app never owned and the user
 * will never trace back to us. So the decision — clear, or leave it alone — is pure and tested
 * here, and the rule is narrow: only ever clear a clipboard that still holds exactly what we put
 * in it.
 */
import { Clipboard } from 'react-native';
import {
  CLIPBOARD_AUTO_CLEAR_MS,
  clipboardClearPlan,
  copyWithAutoClear,
  disposeClipboardAutoClear,
} from '../clipboard';

describe('clipboardClearPlan', () => {
  it('clears while the clipboard still holds exactly what we wrote', () => {
    expect(clipboardClearPlan({ written: '482913', current: '482913' })).toBe(
      true,
    );
  });

  it('leaves the clipboard alone once the user has copied something else', () => {
    // The whole point of the check. Anything else here is the app deleting a stranger's data.
    expect(
      clipboardClearPlan({ written: '482913', current: 'https://example.com' }),
    ).toBe(false);
  });

  it('treats a near-match as somebody else, because that is what it is', () => {
    // A trimmed or re-wrapped variant did not come from us — some other app normalised it, or
    // the user edited it. Only an exact match is evidence that our value is still in there.
    expect(clipboardClearPlan({ written: '482913', current: ' 482913' })).toBe(
      false,
    );
  });

  it('does nothing when there was never anything of ours to clear', () => {
    expect(clipboardClearPlan({ written: '', current: '' })).toBe(false);
    // An already-empty clipboard needs no write, and writing to it would be a pointless
    // clipboard-changed broadcast to every listener on the device.
    expect(clipboardClearPlan({ written: '482913', current: '' })).toBe(false);
  });
});

describe('copyWithAutoClear', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    disposeClipboardAutoClear();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('copies immediately and clears once the window has passed', async () => {
    const set = jest.spyOn(Clipboard, 'setString').mockReturnValue(undefined);
    jest.spyOn(Clipboard, 'getString').mockResolvedValue('482913');

    copyWithAutoClear('482913');
    expect(set).toHaveBeenCalledWith('482913');

    set.mockClear();
    await jest.advanceTimersByTimeAsync(CLIPBOARD_AUTO_CLEAR_MS);
    expect(set).toHaveBeenCalledWith('');
  });

  it('does not clear a clipboard the user has since overwritten', async () => {
    const set = jest.spyOn(Clipboard, 'setString').mockReturnValue(undefined);
    jest.spyOn(Clipboard, 'getString').mockResolvedValue('something else');

    copyWithAutoClear('482913');
    set.mockClear();
    await jest.advanceTimersByTimeAsync(CLIPBOARD_AUTO_CLEAR_MS);
    expect(set).not.toHaveBeenCalled();
  });

  it('keeps at most one pending clear, so repeated copies cannot pile up timers', async () => {
    const set = jest.spyOn(Clipboard, 'setString').mockReturnValue(undefined);
    jest.spyOn(Clipboard, 'getString').mockResolvedValue('second');

    copyWithAutoClear('first');
    copyWithAutoClear('second');
    set.mockClear();

    await jest.advanceTimersByTimeAsync(CLIPBOARD_AUTO_CLEAR_MS);
    // One clear, for the value that is actually in there — not two, and not one aimed at the
    // first value that would have fired while `second` was still on the clipboard.
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('');
  });

  it('hands back a disposer that cancels the pending clear (§M20.3)', async () => {
    const set = jest.spyOn(Clipboard, 'setString').mockReturnValue(undefined);
    jest.spyOn(Clipboard, 'getString').mockResolvedValue('482913');

    const cancel = copyWithAutoClear('482913');
    set.mockClear();
    cancel();

    await jest.advanceTimersByTimeAsync(CLIPBOARD_AUTO_CLEAR_MS * 2);
    // A screen that unmounts mid-window must be able to drop its timer; a timer that outlives
    // its owner is exactly the leak §M20.3 forbids.
    expect(set).not.toHaveBeenCalled();
  });

  it('cancels only its OWN clear, never a later copy on another screen', async () => {
    const set = jest.spyOn(Clipboard, 'setString').mockReturnValue(undefined);
    jest.spyOn(Clipboard, 'getString').mockResolvedValue('second');

    const cancelFirst = copyWithAutoClear('first');
    copyWithAutoClear('second');
    set.mockClear();
    // Screen A unmounts after screen B has copied. A disposer that simply cancelled "the"
    // pending timer would take B's clear down with it, and B's value — the one actually sitting
    // on the clipboard — would never be wiped. Silent, and a leak of exactly what this module
    // exists to protect.
    cancelFirst();

    await jest.advanceTimersByTimeAsync(CLIPBOARD_AUTO_CLEAR_MS);
    expect(set).toHaveBeenCalledWith('');
  });

  it('survives a clipboard read that throws rather than taking the caller down', async () => {
    jest.spyOn(Clipboard, 'setString').mockReturnValue(undefined);
    jest
      .spyOn(Clipboard, 'getString')
      .mockRejectedValue(new Error('clipboard unavailable'));

    copyWithAutoClear('482913');
    // An unhandled rejection from a background timer crashes the app in release. Copying text is
    // never worth that.
    await expect(
      jest.advanceTimersByTimeAsync(CLIPBOARD_AUTO_CLEAR_MS),
    ).resolves.toBeUndefined();
  });
});
