import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FindCount } from '../FindBar';
import { NO_FIND, type ViewerFind, type ViewerFindResult } from './types';

const NOTHING: ViewerFindResult = { count: 0, index: -1 };

// The match after `by` steps from `index`, going round at either end. -1 with no matches.
export function steppedIndex(index: number, by: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  // From "none chosen": forward lands on the first match, back on the last.
  if (index < 0) return by > 0 ? 0 : count - 1;
  return (index + by + count) % count;
}

// What FindBar shows for a viewer's answer: "3 of 27", "3 of 10000+" at the viewer's cap.
export function viewerFindCount(result: ViewerFindResult): FindCount {
  return { total: result.count, current: result.index + 1, scanning: !!result.partial };
}

// §18 W19 (A15): Find for the viewers of the contract (viewers/types). The Reader owns the query
// (useReaderFind); this keeps which match is asked for and what the viewer answered. A new query
// asks for -1, "your first match from where reading is"; the viewer answers with the one it
// chose, and next / previous step from that answer.
export function useViewerFind(query: string, open: boolean) {
  const [asked, setAsked] = useState(-1);
  const [result, setResult] = useState<ViewerFindResult>(NOTHING);
  const latest = useRef(result);
  latest.current = result;

  const active = open && query.trim().length > 0;
  useEffect(() => {
    setAsked(-1);
    if (!active) setResult(NOTHING);
  }, [query, active]);

  const find = useMemo<ViewerFind>(() => (active ? { query, index: asked } : NO_FIND), [active, query, asked]);

  const onFindResult = useCallback((next: ViewerFindResult) => {
    setResult((prev) => (prev.count === next.count && prev.index === next.index && !!prev.partial === !!next.partial ? prev : next));
  }, []);

  const step = useCallback((by: 1 | -1) => {
    const now = latest.current;
    setAsked(steppedIndex(now.index, by, now.count));
  }, []);

  const count = useMemo(() => viewerFindCount(active ? result : NOTHING), [active, result]);
  return { find, onFindResult, step, count };
}
