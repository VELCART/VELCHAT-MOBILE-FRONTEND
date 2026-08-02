/**
 * Typing SEND lifecycle (§C4). Wires the composer's text changes to `syncEngine.sendTyping`:
 *   - `start` is THROTTLED to at most once per ~3s while typing (never spam the socket),
 *   - `stop` fires after ~4s idle, on empty text, on send, on unmount / conversation change, and
 *     when the app leaves the foreground (§M13 — no chatter in the background).
 * Every timer + the AppState subscription is owned and disposed on unmount (§M7).
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { syncEngine } from '../../../domain/sync';
import { shouldEmitStart, TYPING_IDLE_STOP_MS } from './typingThrottle';

export function useTyping(conversationId: string): {
  notifyTyping: (text: string) => void;
  stopTyping: () => void;
} {
  // `active` = we've sent a `start` not yet followed by a `stop` (so `stop` isn't spammed).
  const activeRef = useRef(false);
  const lastStartRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    clearIdle();
    lastStartRef.current = null;
    if (!activeRef.current) return;
    activeRef.current = false;
    syncEngine.sendTyping(conversationId, 'stop');
  }, [conversationId, clearIdle]);

  const notifyTyping = useCallback(
    (text: string) => {
      if (text.trim().length === 0) {
        stopTyping();
        return;
      }
      const now = Date.now();
      if (shouldEmitStart(lastStartRef.current, now)) {
        lastStartRef.current = now;
        activeRef.current = true;
        syncEngine.sendTyping(conversationId, 'start');
      }
      // Re-arm the idle watchdog on every keystroke.
      clearIdle();
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        stopTyping();
      }, TYPING_IDLE_STOP_MS);
    },
    [conversationId, stopTyping, clearIdle],
  );

  // Stop on app-background and on unmount / conversation change (owned subscription, §M7/§M13).
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') stopTyping();
    });
    return () => {
      sub.remove();
      stopTyping();
    };
  }, [stopTyping]);

  return { notifyTyping, stopTyping };
}
