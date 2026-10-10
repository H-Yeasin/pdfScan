import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { toLocalDateString } from './localDate';

// A clock older than this is read again when its screen comes back.
const STALE_MS = 60_000;

// Milliseconds from `now` to the next local midnight (a day is 23 or 25 hours when the clocks
// change, so this goes through the calendar, not `now + 24 h`).
export function msUntilNextDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}

// §16 G5: "now" for a screen that shows days ("today", "2 days ago", "overdue"), as state instead
// of a `Date.now()` in render. A `Date.now()` there is a new number on every render, so every memo
// that depends on it runs again each time. This one changes at midnight, when the app comes back
// to the foreground, and when `active` turns true (the screen is shown again, §16 G2 keeps it
// mounted) after a minute or more. `today` is the local 'YYYY-MM-DD' day of `now`.
export function useDayClock(active = true): { now: number; today: string } {
  const [now, setNow] = useState(() => Date.now());
  const today = toLocalDateString(now);

  useEffect(() => {
    // A second past midnight, so a timer that fires a little early still lands on the new day.
    const id = setTimeout(() => setNow(Date.now()), msUntilNextDay(now) + 1000);
    return () => clearTimeout(id);
  }, [now]);

  useEffect(() => {
    if (!active) return;
    const refresh = () => setNow((prev) => (Date.now() - prev >= STALE_MS ? Date.now() : prev));
    refresh();
    // Timers don't run while the app is in the background: midnight may have passed.
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });
    return () => sub.remove();
  }, [active]);

  return { now, today };
}
