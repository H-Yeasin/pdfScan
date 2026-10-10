import { useCallback, useEffect, useMemo, useState } from 'react';
import { searchTextDirect, type PDFSearchResultItem } from 'react-native-pdf-jsi';
import { useBackHandler } from '../../navigation/useBackHandler';
import { createFindRunner } from '../../services/reader/findRunner';

const SEARCH_DEBOUNCE_MS = 200;

// One shared empty list: clearing the results twice in a row doesn't re-render the Reader.
const NO_RESULTS: PDFSearchResultItem[] = [];

type PdfSearch = { pdfId: string; query: string; from: number; to: number };

type Options = {
  // The PDF being searched (pdf-jsi's searchTextDirect), or undefined: the viewer finds in its own
  // text and reports the count through setLocalMatchCount.
  pdfUri: string | undefined;
  pdfId: string;
  pageCount: number;
  // Resets everything when another document opens.
  contentKey: string | undefined;
  goToPage: (page: number) => void;
};

// The Reader's Find: the query, the PDF engine's hits (highlighted in the viewer), and the
// match count shown in the top bar.
export function useReaderFind({ pdfUri, pdfId, pageCount, contentKey, goToPage }: Options) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PDFSearchResultItem[]>(NO_RESULTS);
  const [localMatchCount, setLocalMatchCount] = useState(0);
  // §5 T2: the PDF page a page search result opened on. While set, Find searches only that page
  // (fast) and stays there; typing a new query searches the whole document again.
  const [targetPage, setTargetPage] = useState<number | null>(null);
  // §18 W2: only the newest search's answer is used (services/reader/findRunner).
  const runner = useMemo(
    () => createFindRunner(({ pdfId: id, query: q, from, to }: PdfSearch) => searchTextDirect(id, q, from, to)),
    []
  );

  // §18 W2: closing Find ends the search, not just the bar: the query, the results and so the
  // highlights all go (the viewers that find in their own text clear theirs on the empty query),
  // and a search still running can't bring them back. It used to only hide the bar, which left
  // the highlights on the page.
  const close = useCallback(() => {
    runner.close();
    setOpen(false);
    setQuery('');
    setSearchResults(NO_RESULTS);
    setLocalMatchCount(0);
    setTargetPage(null);
  }, [runner]);
  // §9 O1: Android back closes the find bar before leaving the Reader.
  useBackHandler(close, open);

  const toggle = useCallback(() => {
    if (open) close();
    else setOpen(true);
  }, [open, close]);

  useEffect(() => close(), [contentKey, close]);
  // A search that outlives the Reader must not scroll a viewer that is gone.
  useEffect(() => () => runner.close(), [runner]);

  useEffect(() => {
    const q = query.trim();
    // Whatever is in flight answers an older query (or page range).
    runner.close();
    if (!q || !pdfUri) {
      setSearchResults(NO_RESULTS);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const [from, to] = targetPage ? [targetPage, targetPage] : [1, Math.max(pageCount, 1)];
        const results = await runner.run({ pdfId, query: q, from, to });
        if (!results) return;
        setSearchResults(results);
        if (targetPage) goToPage(targetPage);
        else if (results[0]) goToPage(results[0].page);
      } catch (e) {
        console.warn('ReaderScreen: searchTextDirect failed', e);
        setSearchResults(NO_RESULTS);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, pdfUri, pdfId, pageCount, targetPage, goToPage, runner]);

  // §18 W2: undefined, never a fresh [], when there is nothing to highlight. pdf-jsi redraws (and
  // jumps to the top of the page, audit A0-3) whenever this prop's identity changes, so an empty
  // list must not look like a change.
  const highlightRects = useMemo(
    () => (searchResults.length > 0 ? searchResults.map((r) => ({ page: r.page, rect: r.rect })) : undefined),
    [searchResults]
  );

  // Typing searches the whole document again.
  const changeQuery = useCallback((value: string) => {
    setTargetPage(null);
    setQuery(value);
  }, []);

  // A search result: stay on its page and, with a query, find it there.
  const openOnPage = useCallback((page: number, q?: string) => {
    setTargetPage(page);
    if (q) {
      setOpen(true);
      setQuery(q);
    }
  }, []);

  return {
    open,
    toggle,
    close,
    query,
    changeQuery,
    openOnPage,
    highlightRects,
    matchCount: pdfUri ? searchResults.length : localMatchCount,
    setLocalMatchCount,
  };
}
