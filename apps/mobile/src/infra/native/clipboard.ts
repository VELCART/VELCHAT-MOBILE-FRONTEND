/**
 * Copy to the clipboard, and take it back out again (VC-019, §A1).
 *
 * The Android clipboard is a single process-wide buffer with no owner and no expiry: whatever
 * was last copied stays readable by any app that comes to the foreground until something else
 * overwrites it. An OTP, an invite link, a message body copied out of a chat — all of them
 * outlive the screen the user copied them on, sometimes by days. Clearing on a timer closes
 * that.
 *
 * `react-native`'s own Clipboard is used rather than `@react-native-clipboard/clipboard`
 * specifically to avoid a new dependency on a §M1 locked stack. It is deprecated in core and
 * logs one warning on first access; when a future React Native release removes it, swapping in
 * the community module is a two-line change behind this same surface, and it gets its own ADR
 * then. See `docs/adr/0010-threat-model-controls.md`.
 */
import { Clipboard } from 'react-native';
import { log } from '../../core/logger/logger';

/**
 * How long a copied value is allowed to sit there.
 *
 * Long enough to switch apps and paste (the user copied it in order to use it somewhere, and a
 * clipboard that empties itself mid-task is a bug report, not a security feature), short enough
 * that it is gone before the phone is put down.
 */
export const CLIPBOARD_AUTO_CLEAR_MS = 60_000;

/**
 * Should the clipboard be wiped now?
 *
 * Pure, and tested, because the wrong answer here deletes data the app never owned. Between the
 * copy and the timer the user may well have copied something else — a URL, a password out of
 * their manager — and blindly clearing would destroy it with no trace back to us. So the rule is
 * narrow: only clear a clipboard that still holds EXACTLY what we put in it. Anything else,
 * including a trimmed or re-wrapped variant, came from somewhere else and is left alone.
 */
export function clipboardClearPlan(input: {
  /** What this module wrote. */
  readonly written: string;
  /** What is on the clipboard right now. */
  readonly current: string;
}): boolean {
  // Nothing of ours to clear, or nothing there at all — and writing "" onto an already-empty
  // clipboard is a pointless CLIPBOARD_CHANGED broadcast to every listener on the device.
  if (input.written === '' || input.current === '') return false;
  return input.current === input.written;
}

/**
 * The one pending clear.
 *
 * Module-scoped and singular on purpose (§M20.3, "no unbounded anything"): a screen that lets
 * the user copy repeatedly would otherwise accumulate one live timer per tap, each aimed at a
 * value that is no longer on the clipboard. Replacing it means the clear that eventually fires
 * is always the one aimed at the value actually in there.
 */
let pendingClear: ReturnType<typeof setTimeout> | undefined;

function cancelPendingClear(): void {
  if (pendingClear !== undefined) {
    clearTimeout(pendingClear);
    pendingClear = undefined;
  }
}

/**
 * Put `text` on the clipboard and schedule it to be taken back off.
 *
 * Returns a disposer that cancels the pending clear — call it from the owning screen's teardown
 * so a timer cannot outlive its owner (§M20.3). Cancelling does NOT clear early: the user may
 * still be on their way to paste.
 */
export function copyWithAutoClear(
  text: string,
  afterMs: number = CLIPBOARD_AUTO_CLEAR_MS,
): () => void {
  cancelPendingClear();
  Clipboard.setString(text);

  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    pendingClear = undefined;
    void (async () => {
      try {
        const current = await Clipboard.getString();
        if (clipboardClearPlan({ written: text, current: current ?? '' })) {
          Clipboard.setString('');
        }
      } catch {
        // A rejected read from a background timer becomes an unhandled rejection, which is a
        // crash in release. Copying text is never worth taking the app down for, and the value
        // will be overwritten by the next copy anyway. Nothing about the CONTENT is logged —
        // that is the very thing being protected (§M19).
        log.debug('clipboard auto-clear skipped: read failed');
      }
    })();
  }, afterMs);
  pendingClear = timer;

  return () => {
    // Scoped to THIS copy on purpose. Screens dispose on unmount, and by then another screen may
    // well have copied something of its own — cancelling "the" pending timer at that point would
    // take the newer clear down with it and leave the value that is actually on the clipboard
    // there forever. A disposer that silently disarms someone else's is worse than none.
    if (pendingClear === timer) cancelPendingClear();
  };
}

/**
 * Drop the pending clear without clearing. For test teardown and for a full app teardown — the
 * ordinary caller uses the disposer returned by `copyWithAutoClear`.
 */
export function disposeClipboardAutoClear(): void {
  cancelPendingClear();
}
