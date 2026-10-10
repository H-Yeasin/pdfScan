import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { annotatedPdfFor } from '../../services/annotations/exportPdf';
import { libraryIdxFor } from '../../services/documents/pageMap';
import type { ReaderMoreItemId } from '../../services/documents/readerTools';
import { deleteDocumentFiles } from '../../services/persistence/libraryFiles';
import { promoteExternalToLibrary } from '../../services/persistence/libraryOperations';
import type { ReaderSheet } from '../../services/reader/readerSheets';
import { printDocument, printFileUri, shareAs, shareDocument, shareFileName, shareFileUri } from '../../services/sharing/shareService';
import { writeDocumentText } from '../../services/study/textExport';
import { extractDocumentText } from '../../services/study/textSelection';
import type { AppAction } from '../../store/appReducer';
import type { Annotation, ExternalFileDocument, LibraryDocument } from '../../types/models';
import { MIME_BY_FORMAT } from '../../utils/docFormat';
import type { t as translate } from '../../i18n';

// What the More sheet's items act on and through: the file on screen, and the Reader's own
// flows (each started by a function, so this file renders nothing and knows no sheet's insides).
export type ReaderOverflowContext = {
  doc: LibraryDocument | undefined;
  external: ExternalFileDocument | null;
  pdfUri: string | undefined;
  // §18 W14: the document's marks and signatures, which go out with every copy of its PDF.
  annotations: readonly Annotation[];
  title: string;
  isPageRaster: boolean;
  pageCount: number;
  // The PDF page on screen (1-based).
  pdfPage: number;
  dispatch: (action: AppAction) => void;
  t: typeof translate;
  back: () => void;
  openSheet: (sheet: ReaderSheet) => void;
  submit: (doc: LibraryDocument) => unknown;
  sign: () => void;
  editPages: () => void;
  openCoverOptions: (doc: LibraryDocument) => void;
  convertToPdf: () => void;
  convertToWord: () => void;
  editFile: () => void;
  fillForm: () => void;
};

export type ReaderOverflowActions = Record<ReaderMoreItemId, () => void | Promise<void>>;

// §18 W6: one handler per More item, as a table: a new `ReaderMoreItemId` doesn't compile until it
// has one. (It was a 100-line if/else in ReaderScreen, where a missing branch did nothing.)
// readerTools.readerMoreItems decides which items a file shows; a handler still checks what it
// needs, since the file can change under an open sheet.
export function readerOverflowActions(ctx: ReaderOverflowContext): ReaderOverflowActions {
  const { doc, external, pdfUri, annotations, title, dispatch, t } = ctx;
  const openCover = () => {
    if (doc) ctx.openCoverOptions(doc);
  };
  return {
    share: async () => {
      if (external) await shareFileUri(external.uri, MIME_BY_FORMAT[external.format], external.name);
      else if (doc) await shareDocument(doc, annotations);
    },
    print: async () => {
      if (external) await printFileUri(external.uri);
      else if (doc) await printDocument(doc, annotations);
    },
    export: async () => {
      // A library PDF is shared under the document's name, not as `document.pdf` (see
      // shareAs); an external file already has its own name.
      if (external && pdfUri) await shareFileUri(pdfUri, 'application/pdf', title);
      else if (doc) {
        // §18 W14: the copy with the marks in it (a JPG-format scan's PDF too). §18 W17: a scan
        // that never had a PDF gets one now.
        const annotated = await annotatedPdfFor(doc, annotations);
        if (annotated) await shareAs(annotated, shareFileName(title, 'pdf'), 'application/pdf');
      }
    },
    convertToPdf: ctx.convertToPdf,
    convertToWord: ctx.convertToWord,
    editFile: ctx.editFile,
    fillForm: ctx.fillForm,
    sign: ctx.sign,
    addToLibrary: async () => {
      if (!external) return;
      const promoted = await promoteExternalToLibrary(external);
      // §18 W5: the library copy opens on the page being read, not on page 1.
      if (ctx.isPageRaster && ctx.pageCount > 0) promoted.lastPage = ctx.pdfPage;
      dispatch({ type: 'library/ADD_FILE', file: promoted });
      dispatch({ type: 'reader/SET_READER_ID', id: promoted.id });
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.addedToLibrary') });
    },
    changeType: () => {
      if (doc) ctx.openSheet({ kind: 'type' });
    },
    submit: async () => {
      if (doc) await ctx.submit(doc);
    },
    bookmarks: () => ctx.openSheet({ kind: 'bookmarks' }),
    editPages: ctx.editPages,
    addCover: openCover,
    changeCover: openCover,
    readingSettings: () => ctx.openSheet({ kind: 'reading' }),
    copyText: async () => {
      if (!doc) return;
      // The library page on screen (on a 2-up sheet, its left page).
      const idx = libraryIdxFor(doc, ctx.pdfPage);
      const text = doc.pages[idx]?.ocr?.text.trim() ?? '';
      if (!text) {
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.noPageText') });
        return;
      }
      await Clipboard.setStringAsync(text);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.copiedPage', { page: idx + 1 }) });
    },
    extractText: () => {
      if (!doc) return;
      Alert.alert(t('reader.extractTitle'), t('reader.extractBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reader.copy'),
          onPress: async () => {
            await Clipboard.setStringAsync(extractDocumentText(doc));
            dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.copiedAll') });
          },
        },
        { text: t('reader.shareTxt'), onPress: () => shareAs(writeDocumentText(doc), shareFileName(doc.name, 'txt'), 'text/plain') },
      ]);
    },
    delete: () => {
      if (!doc) return;
      Alert.alert(t('reader.deleteTitle'), t('reader.deleteBody', { name: doc.name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reader.delete'),
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'library/REMOVE_FILES', ids: [doc.id] });
            deleteDocumentFiles(doc.id);
            ctx.back();
          },
        },
      ]);
    },
  };
}

// The More sheet's `onSelect`. It keeps its identity; the item picked runs against the Reader as
// it is at that moment.
export function useReaderOverflowActions(ctx: ReaderOverflowContext) {
  const latest = useRef(ctx);
  latest.current = ctx;
  return useCallback((id: ReaderMoreItemId) => readerOverflowActions(latest.current)[id](), []);
}
