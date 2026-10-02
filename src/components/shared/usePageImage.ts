import { useEffect, useState } from 'react';
import { PREVIEW_JPEG_Q, PREVIEW_MAX_DIM } from '../../services/capture/imageSpec';
import { isPdfLevel } from '../../services/documents/formatCapabilities';
import { renderPage } from '../../services/pdf/pdfNative';
import { cleanTemporaryCache } from '../../services/persistence/libraryFiles';
import type { LibraryDocument } from '../../types/models';

export type PageImage = { uri: string; width: number; height: number };

// The image of one library page to draw on (placing a signature): a scan's master, or - for a
// PDF-level document, whose pages have no master (§7 R2) - the PDF page rendered on demand into
// the cache, deleted again when it's no longer needed. null while rendering, when inactive, or
// when the page can't be rendered.
export function usePageImage(doc: LibraryDocument | null | undefined, pageIndex: number, active: boolean): PageImage | null {
  const page = doc?.pages[pageIndex];
  const pdfLevel = !!doc && isPdfLevel(doc);
  const pdfUri = doc?.pdfUri;
  const [rendered, setRendered] = useState<PageImage | null>(null);

  useEffect(() => {
    if (!active || !pdfLevel || !pdfUri) return;
    let cancelled = false;
    let made: string | null = null;
    renderPage(pdfUri, pageIndex, { maxDim: PREVIEW_MAX_DIM, quality: PREVIEW_JPEG_Q })
      .then((image) => {
        made = image.uri;
        if (cancelled) cleanTemporaryCache([image.uri]);
        else setRendered(image);
      })
      .catch((error) => console.warn('usePageImage: render failed', error));
    return () => {
      cancelled = true;
      setRendered(null);
      if (made) cleanTemporaryCache([made]);
    };
  }, [active, pdfLevel, pdfUri, pageIndex]);

  if (!active || !page) return null;
  if (!pdfLevel) return page.fileUri ? { uri: page.fileUri, width: page.width, height: page.height } : null;
  return rendered;
}
