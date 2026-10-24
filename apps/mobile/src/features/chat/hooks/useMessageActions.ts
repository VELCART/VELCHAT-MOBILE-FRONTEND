/**
 * The owner state machine behind the hold-a-message sheet (§R1, §F2).
 *
 * The screen holds a message, this holds what was held, and the sheet draws it. Two of the
 * three actions live here — the clipboard write and the local delete — because both are side
 * effects on infra and a feature's `ui` folder may not reach infra directly (§M3/§M4). Reply
 * stays with the screen: it already owns the reply-draft state the composer renders.
 *
 * Fire-and-forget by construction. Every returned callback is synchronous and returns `void`:
 * the caller is a press handler on the render path and must never await a disk write or a
 * bridge call (§M0 rule 2). A failed delete is logged and dropped rather than thrown — a
 * rejected promise from a press handler is an unhandled rejection, which is a crash in release,
 * and losing a delete is not worth taking the thread down for.
 *
 * `target` deliberately OUTLIVES `close()`. The sheet animates out over ~220ms and keeps
 * rendering its children the whole way; clearing the target on close would blank the rows
 * mid-slide. Only `visible` flips on close; the target is replaced on the next open and cleared
 * when the conversation changes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { copyWithAutoClear, deleteMessageForMe } from '../../../infra';
import { log } from '../../../core';

/** Everything the sheet needs about the message being held. */
export interface MessageActionTarget {
  /** The LOCAL record id — what `deleteMessageForMe` deletes by. */
  readonly id: string;
  /** The body, '' when there is nothing copyable (a media-only bubble, a tombstone). */
  readonly text: string;
  /** Did this device send it? Drives how plainly the delete has to disclaim an unsend. */
  readonly mine: boolean;
}

export interface MessageActions {
  /** What to draw. Survives `close()` so the exit animation has content. */
  readonly target: MessageActionTarget | null;
  /** Drives the sheet. */
  readonly visible: boolean;
  readonly open: (id: string, text: string, mine: boolean) => void;
  readonly close: () => void;
  /** Copy the held body to the clipboard and dismiss. No body → nothing happens. */
  readonly copy: () => void;
  /** Soft-delete the held message on THIS DEVICE and dismiss. Not an unsend. */
  readonly remove: () => void;
}

export function useMessageActions(conversationId: string): MessageActions {
  const [target, setTarget] = useState<MessageActionTarget | null>(null);
  const [visible, setVisible] = useState(false);

  // The callbacks are handed to a memoised bubble, so they must not change identity when the
  // target does — a new `open` on every hold would re-render every bubble in the window. The
  // ref is how they read the current target without depending on it.
  const targetRef = useRef<MessageActionTarget | null>(null);
  targetRef.current = target;

  /**
   * The disposer for the clipboard auto-clear timer this hook most recently armed (§M20.3).
   * `copyWithAutoClear` keeps exactly one pending clear process-wide and its disposer is scoped
   * to its own timer, so holding only the latest is correct: an older one can no longer be the
   * pending clear, and calling it would be a no-op at best.
   */
  const disposeCopy = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      disposeCopy.current?.();
      disposeCopy.current = null;
    },
    [],
  );

  // Switching conversation on the same mounted screen must take the sheet with it — a sheet
  // offering to delete a message from the thread the user just left is worse than no sheet.
  useEffect(() => {
    setVisible(false);
    setTarget(null);
  }, [conversationId]);

  const open = useCallback((id: string, text: string, mine: boolean) => {
    setTarget({ id, text, mine });
    setVisible(true);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const copy = useCallback(() => {
    const held = targetRef.current;
    setVisible(false);
    if (!held || held.text === '') return;
    // Replaces, never stacks: the previous disposer can only still be live if nothing has been
    // copied since, and `copyWithAutoClear` cancels that pending clear itself.
    disposeCopy.current = copyWithAutoClear(held.text);
  }, []);

  const remove = useCallback(() => {
    const held = targetRef.current;
    setVisible(false);
    if (!held) return;
    void deleteMessageForMe(held.id).catch(() => {
      // No id, no body, no conversation — this is a message the user asked to hide, so the one
      // thing the log must not contain is anything about it (§M19).
      log.warn('chat: local message delete failed');
    });
  }, []);

  return { target, visible, open, close, copy, remove };
}
