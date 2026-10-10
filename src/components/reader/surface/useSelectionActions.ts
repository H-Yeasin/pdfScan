import * as Clipboard from 'expo-clipboard';
import { useCallback, useRef, useState } from 'react';
import { Share } from 'react-native';
import { useT } from '../../../i18n/useT';
import { wordRects } from '../../../services/annotations/snap';
import { runOcr } from '../../../services/ocr/ocrService';
import { resolveOcrScript } from '../../../services/scripts/registry';
import { selectionText, type TextToken } from '../../../services/study/textSelection';
import { useAppDispatch, useAppStore } from '../../../store/AppStateContext';
import type { LibraryDocument } from '../../../types/models';
import { createId } from '../../../utils/id';

// §18 W13 (A8): what can be done with selected words, for the page surface's menu. The words are
// a page's tokens in its own space, so a mark made of them is stored like one drawn in Mark mode.
// The store is read when an action runs, not subscribed to: the surface doesn't render for it.
export function useSelectionActions(doc: LibraryDocument | undefined) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [rerunning, setRerunning] = useState(false);
  const busy = useRef(false);

  const copy = useCallback(
    async (words: readonly TextToken[]) => {
      if (!words.length) return;
      await Clipboard.setStringAsync(selectionText(words));
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.select.copiedWords', { count: words.length }) });
    },
    [dispatch, t]
  );

  const share = useCallback((words: readonly TextToken[]) => {
    const text = selectionText(words);
    if (text) Share.share({ message: text }).catch(() => undefined);
  }, []);

  // §12 D3: the selection as a mark on library page `pageId`, in the colour Mark mode last used
  // for that kind. Returns the new mark's id (null: nothing was made).
  const mark = useCallback(
    (kind: 'highlight' | 'underline', pageId: string, words: readonly TextToken[]): string | null => {
      if (!doc || words.length === 0) return null;
      const { rects, text } = wordRects(words);
      const prefs = store.getState().settings.reading.mark;
      const now = Date.now();
      const id = createId('annot');
      dispatch({
        type: 'library/ADD_ANNOTATION',
        annotation: {
          id,
          documentId: doc.id,
          pageId,
          kind,
          color: kind === 'highlight' ? prefs.highlightColor : prefs.lineColor,
          data: { rects },
          text,
          createdAt: now,
          updatedAt: now,
        },
      });
      dispatch({ type: 'ui/SHOW_SNACK', msg: kind === 'highlight' ? t('reader.select.highlighted') : t('reader.select.underlined') });
      return id;
    },
    [doc, store, dispatch, t]
  );

  // OCR again on a page that has an image (a scan's master). Best-effort, like every OCR run.
  const docId = doc?.id;
  const rerunOcr = useCallback(
    async (pageIdx: number) => {
      if (!docId || busy.current) return;
      const before = store.getState();
      const page = before.library.files.find((f) => f.id === docId)?.pages[pageIdx];
      if (!page?.fileUri) return;
      busy.current = true;
      setRerunning(true);
      try {
        // §6 L1: the document's course decides the script, like it did when the page was scanned.
        const owner = before.library.files.find((f) => f.id === docId);
        const course = before.library.courses.find((c) => c.id === owner?.courseId);
        const ocr = await runOcr(page.fileUri, resolveOcrScript({ course, settings: before.settings }));
        // The document as it is by now: the pages may have been saved meanwhile.
        const latest = store.getState().library.files.find((f) => f.id === docId);
        if (!latest) return;
        const pages = latest.pages.map((p) => (p.id === page.id ? { ...p, ocr, ocrFailed: ocr === undefined || undefined } : p));
        dispatch({ type: 'library/UPDATE_FILE', id: docId, patch: { pages } });
        if (!ocr?.text.trim()) dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.select.stillNoText') });
      } finally {
        busy.current = false;
        setRerunning(false);
      }
    },
    [docId, store, dispatch, t]
  );

  return { copy, share, mark, rerunOcr, rerunning };
}
