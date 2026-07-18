/**
 * Auth flow hooks — bridge device-key (infra/crypto) + auth API + AuthMachine.
 * Screens (feature-ui) call these; they never touch infra directly.
 */
import { useCallback, useRef, useState } from 'react';
import { ensureDeviceKey, isAppError } from '../../../infra';
import { register, fetchSession } from '../api/authApi';
import { useAuthStore } from '../model/authStore';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 min

export function useStartPhoneAuth(): {
  start: (phone: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
} {
  const beginVerify = useAuthStore(s => s.beginVerify);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (phone: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const devicePubkeyBase64 = ensureDeviceKey();
        const { sessionId } = await register(phone, devicePubkeyBase64);
        beginVerify(phone, sessionId);
        return true;
      } catch (e) {
        setError(
          isAppError(e)
            ? e.message
            : 'Could not start sign-in. Please try again.',
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [beginVerify],
  );

  return { start, loading, error };
}

export function useSessionPolling(): {
  verified: boolean;
  timedOut: boolean;
  begin: () => void;
  stop: () => void;
} {
  const sessionId = useAuthStore(s => s.sessionId);
  const provision = useAuthStore(s => s.provision);
  const [verified, setVerified] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const begin = useCallback(() => {
    if (!sessionId) return;
    attempts.current = 0;
    setTimedOut(false);
    const tick = async (): Promise<void> => {
      attempts.current += 1;
      try {
        const tokens = await fetchSession(sessionId);
        provision(tokens); // → active
        setVerified(true);
        stop();
      } catch {
        if (attempts.current >= MAX_POLLS) {
          setTimedOut(true);
          stop();
          return;
        }
        timer.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    };
    void tick();
  }, [sessionId, provision, stop]);

  return { verified, timedOut, begin, stop };
}
