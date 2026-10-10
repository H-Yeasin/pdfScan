import { useCallback, useState } from 'react';

// The Reader's Find: whether it is open, and the query. §18 W12: the page surface searches the
// query itself and reports what it found (surface/useSurfaceFind). §18 W19: so do the other
// viewers, through the viewer contract (viewers/useViewerFind keeps their current match). §18 W6: one instance per file (ReaderDocumentView is keyed on
// it), so another document starts with Find closed. Android Back closing Find is the caller's
// (readerSheets.readerBackTarget: a sheet or a tool comes first).
export function useReaderFind() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // §5 T2, §18 W12: the library page (0-based) a page search result opened Find on. The surface
  // starts from it; the whole document is searched either way. Typing a new query starts from
  // where reading is again.
  const [targetPage, setTargetPage] = useState<number | null>(null);

  // §18 W2: closing Find ends the search, not just the bar: the query goes, and with it every
  // viewer's highlights (each clears its own on the empty query).
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setTargetPage(null);
  }, []);

  const toggle = useCallback(() => {
    if (open) close();
    else setOpen(true);
  }, [open, close]);

  const changeQuery = useCallback((value: string) => {
    setTargetPage(null);
    setQuery(value);
  }, []);

  // A search result: start from its page and, with a query, find it there.
  const openOnPage = useCallback((page: number, q?: string) => {
    setTargetPage(page);
    if (q) {
      setOpen(true);
      setQuery(q);
    }
  }, []);

  return { open, toggle, close, query, changeQuery, openOnPage, targetPage };
}
