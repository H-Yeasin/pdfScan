import { useEffect, useRef, useState } from 'react';
import { PREVIEW_JPEG_Q, PREVIEW_MAX_DIM } from '../../services/capture/imageSpec';
import { processSequentially } from '../../services/capture/processSequentially';
import { renderPage } from '../../services/pdf/pdfNative';
import { cleanTemporaryCache } from '../../services/persistence/libraryFiles';
import type { LibraryDocument } from '../../types/models';

// §12 D3: the image Mark mode draws on for each page in its window. A scan's page has its master
// (or display copy) on disk. An imported PDF's page has none (§7 R1), so it's rendered into the
// cache when it enters the window - one page at a time - and deleted when it leaves, or when Mark
// mode closes. Returns page id → image uri.
export function useMarkPageImages(doc: LibraryDocument, pageWindow: readonly number[]): Record<string, string> {
  const [rendered, setRendered] = useState<Record<string, string>>({});
  const cache = useRef(new Map<string, string>());
  const pdfUri = doc.pdfUri;
  const windowKey = pageWindow.join(',');

  useEffect(() => {
    if (!pdfUri) return;
    const wanted = new Map<string, number>();
    for (const i of pageWindow) {
      const page = doc.pages[i];
      if (page && !page.fileUri) wanted.set(page.id, i);
    }
    for (const [id, uri] of [...cache.current]) {
      if (wanted.has(id)) continue;
      cleanTemporaryCache([uri]);
      cache.current.delete(id);
    }
    setRendered(Object.fromEntries(cache.current));

    const controller = new AbortController();
    const todo = [...wanted].filter(([id]) => !cache.current.has(id));
    processSequentially(
      todo,
      async ([id, index]) => {
        // Library page i of an imported PDF is the file's page i (0-based, like pdfNative).
        const image = await renderPage(pdfUri, index, { maxDim: PREVIEW_MAX_DIM, quality: PREVIEW_JPEG_Q });
        // The window moved on while this page rendered (or Mark mode closed): not needed.
        if (controller.signal.aborted || cache.current.has(id)) {
          cleanTemporaryCache([image.uri]);
          return;
        }
        cache.current.set(id, image.uri);
        setRendered(Object.fromEntries(cache.current));
      },
      { signal: controller.signal }
    ).then((result) => {
      if (result.error !== undefined) console.warn('Mark mode: a page could not be rendered', result.error);
    });
    return () => controller.abort();
    // windowKey stands for `pageWindow`; doc.pages only matters through the pages in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey, pdfUri]);

  useEffect(
    () => () => {
      cleanTemporaryCache([...cache.current.values()]);
      cache.current.clear();
    },
    []
  );

  return rendered;
}
