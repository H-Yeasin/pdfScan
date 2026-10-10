import { useCallback, useEffect, useRef, useState } from 'react';
import { searchTextDirect } from 'react-native-pdf-jsi';

const FLASH_MS = 1600;

// §12 D4: a mark picked in the notes panel flashes on its page. The viewer draws PDF-space rects
// only, and a mark is stored in master pixels (mapped through crop boxes and /Rotate for an
// imported PDF), so rather than map it here the PDF's own text is searched for the mark's words on
// that page: a scan's invisible OCR layer or an imported PDF's text. Best effort: no text, no
// flash.
export function useMarkFlash(pdfId: string) {
  const [rects, setRects] = useState<Array<{ page: number; rect: string }> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef(0);

  const clear = useCallback(() => {
    run.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRects(null);
  }, []);
  // Leaving the document ends the flash (and its timer).
  useEffect(() => clear, [clear]);

  const flash = useCallback(
    async (page: number, query: string) => {
      clear();
      const mine = run.current;
      try {
        const results = await searchTextDirect(pdfId, query, page, page);
        if (mine !== run.current || results.length === 0) return;
        setRects(results.map((r) => ({ page: r.page, rect: r.rect })));
        timer.current = setTimeout(clear, FLASH_MS);
      } catch (e) {
        console.warn('useMarkFlash: searchTextDirect failed', e);
      }
    },
    [pdfId, clear]
  );

  return { rects, flash, clear };
}
