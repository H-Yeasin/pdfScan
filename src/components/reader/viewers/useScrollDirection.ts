import { useCallback, useEffect, useRef, useState } from 'react';
import { scrollSaid, type ScrollDirection } from '../../../services/reader/chromeState';

// §18 W19: a viewer's own vertical scroll, as the Reader's bars want to hear it. Call the result
// with the scroll offset and the furthest it can go (content height less the view's).
export function useScrollDirection(onScrollDirection: (direction: ScrollDirection) => void) {
  const last = useRef<number | null>(null);
  const travel = useRef(0);
  const report = useRef(onScrollDirection);
  report.current = onScrollDirection;

  return useCallback((y: number, max: number) => {
    const dy = last.current === null ? 0 : y - last.current;
    last.current = y;
    const next = scrollSaid(travel.current, dy, { atStart: y <= 0, atEnd: max > 0 && y >= max - 1 });
    travel.current = next.travel;
    // Nothing is said about the place the content opens on: only about a movement.
    if (next.say && dy !== 0) report.current(next.say);
  }, []);
}

// `value`, once it has stopped changing for `ms`: Find's query, so a search runs per pause in the
// typing and not per letter. An empty value passes at once (closing Find clears the marks now).
export function useDebounced<T>(value: T, ms: number, immediate: (value: T) => boolean): T {
  const [settled, setSettled] = useState(value);
  const now = immediate(value);
  useEffect(() => {
    if (now) {
      setSettled(value);
      return;
    }
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms, now]);
  return now ? value : settled;
}
