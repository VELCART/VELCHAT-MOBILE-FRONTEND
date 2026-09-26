/**
 * A "now" that is allowed to change, for anything that classifies a timestamp as today /
 * yesterday / older.
 *
 * The chat screen used to freeze `now` at mount (`useMemo(() => Date.now(), [])`) so the date
 * chips would not be rebuilt on every render. That is the right instinct and the wrong lifetime:
 * a messaging app is left open across midnight routinely, and when it rolls over, every chip
 * still says "Today" for what is now yesterday — and the first message to arrive afterwards gets
 * a correctly-placed separator labelled "27 Sep", because `dayCategory` measures it against the
 * stale value. Two contradictory labels on one screen.
 *
 * So it updates exactly twice as often as it must: at the next local midnight, and when the app
 * comes back to the foreground (a phone that was asleep through midnight never ran the timer).
 * Both are owned and disposed (§M7), and neither fires on a render.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

function msUntilNextMidnight(from: number): number {
  const next = new Date(from);
  next.setHours(24, 0, 0, 0);
  // Never schedule a zero/negative timeout: a DST jump can put the computed midnight in the
  // past, and setTimeout(…, <=0) would spin.
  return Math.max(1000, next.getTime() - from);
}

export function useDayClock(): number {
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    const arm = (): void => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (!alive) return;
        setNow(Date.now());
        arm();
      }, msUntilNextMidnight(Date.now()));
    };
    arm();

    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' || !alive) return;
      // Only move it when the calendar day actually changed — an ordinary app switch must not
      // rebuild every chip label for nothing.
      setNow(prev =>
        new Date(prev).toDateString() === new Date().toDateString()
          ? prev
          : Date.now(),
      );
      arm();
    });

    return () => {
      alive = false;
      sub.remove();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  return now;
}
