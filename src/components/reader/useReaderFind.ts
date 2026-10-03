import { useCallback, useEffect, useMemo, useState } from 'react';
import { searchTextDirect, type PDFSearchResultItem } from 'react-native-pdf-jsi';
import { useBackHandler } from '../../navigation/useBackHandler';

const SEARCH_DEBOUNCE_MS = 200;

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
  // §9 O1: Android back closes the find bar before leaving the Reader.
  useBackHandler(() => setOpen(false), open);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PDFSearchResultItem[]>([]);
  const [localMatchCount, setLocalMatchCount] = useState(0);
  // §5 T2: the PDF page a page search result opened on. While set, Find searches only that page
  // (fast) and stays there; typing a new query searches the whole document again.
  const [targetPage, setTargetPage] = useState<number | null>(null);

  useEffect(() => {
    setOpen(false);
    setQuery('');
    setSearchResults([]);
    setLocalMatchCount(0);
    setTargetPage(null);
  }, [contentKey]);

  useEffect(() => {
    const q = query.trim();
    if (!q || !pdfUri) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const [from, to] = targetPage ? [targetPage, targetPage] : [1, Math.max(pageCount, 1)];
        const results = await searchTextDirect(pdfId, q, from, to);
        setSearchResults(results);
        if (targetPage) goToPage(targetPage);
        else if (results[0]) goToPage(results[0].page);
      } catch (e) {
        console.warn('ReaderScreen: searchTextDirect failed', e);
        setSearchResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, pdfUri, pdfId, pageCount, targetPage, goToPage]);

  const highlightRects = useMemo(() => searchResults.map((r) => ({ page: r.page, rect: r.rect })), [searchResults]);

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
    setOpen,
    query,
    changeQuery,
    openOnPage,
    highlightRects,
    matchCount: pdfUri ? searchResults.length : localMatchCount,
    setLocalMatchCount,
  };
}
