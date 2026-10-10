import { useEffect } from 'react';
import { hasDeferredBlocks, withPageBlocks } from '../../services/documents/pageOcr';
import { useAppDispatch } from '../../store/AppStateContext';
import type { LibraryDocument } from '../../types/models';

// §16 G4: the Reader's document gets its word boxes (Select text, Mark mode's snap-to-word) when
// it opens: the library load leaves them in the database. One read per document and session; the
// boxes then stay in the state like any just-saved document's.
export function usePageOcr(doc: LibraryDocument | undefined) {
  const dispatch = useAppDispatch();
  const id = doc?.id;
  const pages = doc?.pages;
  const waiting = !!pages && hasDeferredBlocks(pages);
  useEffect(() => {
    if (!id || !pages || !waiting) return;
    let cancelled = false;
    withPageBlocks(pages)
      .then((loaded) => {
        if (!cancelled) dispatch({ type: 'library/SET_PAGE_OCR', id, pages: loaded });
      })
      // Best-effort, like OCR itself: without the boxes the page reads as having no words to pick.
      .catch((error) => console.warn('Reader: loading word boxes failed', error));
    return () => {
      cancelled = true;
    };
  }, [id, pages, waiting, dispatch]);
}
