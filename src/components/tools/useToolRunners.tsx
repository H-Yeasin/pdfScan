import { useCallback, useRef, useState } from 'react';
import { useT } from '../../i18n/useT';
import { useRouter } from '../../navigation/router';
import { startScan } from '../../services/courses/startScan';
import { PdfEncryptedError } from '../../services/pdf/pdfErrors';
import type { ToolOptions, ToolResult } from '../../services/tools/toolFlow';
import type { ToolDef, ToolId } from '../../services/tools/toolRegistry';
import { useAppDispatch, useAppStore } from '../../store/AppStateContext';
import { useGalleryImport } from '../../store/useGalleryImport';
import { useImportFile } from '../../store/useImportFile';
import { useSubmitDocument } from '../../store/useSubmitDocument';
import type { LibraryDocument } from '../../types/models';
import { useBackupExport } from '../backup/useBackupExport';
import { useOpenCoverOptions } from '../library/useCoverTarget';
import { compressDocuments } from '../library/useDocumentActions';
import { runPageTool, useDocumentListActions, useOpenDocument } from '../library/useDocumentListActions';
import { useConvertToPdf } from '../reader/useConvertToPdf';
import { useConvertToWord } from '../reader/useConvertToWord';
import { useEditPages } from '../reader/useEditPages';
import { useFillForm } from '../reader/useFillForm';

// What a tool does with the documents picked for it. A result opens the result sheet; null ends the
// flow (the tool handed over to its own screen or dialog, or a gated tool will report later through
// `onResult`). A runner that fails says why itself (a snack) and throws, so the flow ends.
type Runner = (docs: LibraryDocument[], options: ToolOptions) => Promise<ToolResult | null> | ToolResult | null;

// §17 U8: the Tools tab's runners, one per toolRegistry id (a Record, so a new tool doesn't compile
// without one). Every runner reuses the flow the tool already has elsewhere: the merge/split/compress
// services Files uses, the Reader's convert and form hooks (through D1's Pro gate), Files' signing
// overlays, Academic options, Submit, the backup export. Render `overlays` once.
export function useToolRunners(onResult: (result: ToolResult) => void) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  // Read when a tool runs, not subscribed to: the Tools tab doesn't re-render on library changes.
  const store = useAppStore();
  const { go, switchTab } = useRouter();
  const importPhotos = useGalleryImport();
  const importFile = useImportFile();
  const openDocument = useOpenDocument();
  const submit = useSubmitDocument();
  const openCoverOptions = useOpenCoverOptions();
  const { exportScope, overlay: backupOverlay } = useBackupExport();
  // Signing: Files' flow (capture or reuse the saved signature, then place it on page 1).
  const listActions = useDocumentListActions();
  const { runTool } = listActions;

  const resultFor = useCallback((tool: ToolId) => (doc: LibraryDocument) => onResult({ tool, docIds: [doc.id] }), [onResult]);
  const convertPdf = useConvertToPdf({ preload: false, onDone: resultFor('toPdf') });
  const convertWord = useConvertToWord({ preload: false, onDone: resultFor('toWord') });
  const form = useFillForm({ preload: false, onSaved: resultFor('fillForm') });

  // Edit pages opens its editor over the Tools tab for the document picked.
  const [editDoc, setEditDoc] = useState<LibraryDocument | undefined>(undefined);
  const editPages = useEditPages(editDoc, () => undefined);

  const fail = useCallback(
    (error: unknown): never => {
      dispatch({ type: 'ui/SHOW_SNACK', msg: error instanceof PdfEncryptedError ? t('library.passwordProtected') : t('library.toolFailed') });
      throw error;
    },
    [dispatch, t]
  );

  const runners: Record<ToolId, Runner> = {
    scan: () => {
      const state = store.getState();
      startScan(state, dispatch, null, { launch: true, mode: state.settings.lastCaptureMode });
      return null;
    },
    importPhotos: () => {
      startScan(store.getState(), dispatch, null, { launch: false });
      void importPhotos();
      return null;
    },
    importFile: () => {
      void importFile();
      return null;
    },
    search: () => {
      dispatch({ type: 'libraryUi/OPEN_SEARCH' });
      switchTab('library');
      return null;
    },
    backup: () => {
      go('backup');
      return null;
    },
    merge: async (docs, options) => runPageToolFor('merge', docs, options),
    split: async (docs, options) => runPageToolFor('split', docs, options),
    compress: async (docs, options) => {
      try {
        const message = await compressDocuments(docs, dispatch, options.quality);
        return { tool: 'compress', docIds: docs.map((d) => d.id), message };
      } catch (error) {
        return fail(error);
      }
    },
    editPages: ([doc]) => {
      setEditDoc(doc);
      editPages.open();
      return null;
    },
    addCover: ([doc]) => {
      openCoverOptions(doc);
      return null;
    },
    toPdf: ([doc]) => {
      if (doc.contentUri) convertPdf.start({ uri: doc.contentUri, name: doc.name, format: doc.format, docId: doc.id });
      return null;
    },
    toWord: ([doc]) => {
      convertWord.start({ docId: doc.id, title: doc.name, grantId: doc.id });
      return null;
    },
    sign: ([doc]) => {
      void runTool('sign', [doc], 'menu');
      return null;
    },
    fillForm: ([doc]) => {
      void form.start({ doc });
      return null;
    },
    // Every page of the documents, in the order picked, into the exam-pack tray; then the tray.
    examPack: (docs) => {
      const items = docs.flatMap((doc) => doc.pages.map((page) => ({ documentId: doc.id, pageId: page.id })));
      const courseId = docs.every((d) => d.courseId === docs[0].courseId) ? (docs[0].courseId ?? null) : null;
      dispatch({ type: 'pack/ADD', items, courseId });
      go('examPack');
      return null;
    },
    // §5 T3's text export, through the share sheet.
    extractText: async ([doc]) => {
      const { shareAs, shareFileName } = require('../../services/sharing/shareService') as typeof import('../../services/sharing/shareService');
      const { writeDocumentText } = require('../../services/study/textExport') as typeof import('../../services/study/textExport');
      try {
        await shareAs(writeDocumentText(doc), shareFileName(doc.name, 'txt'), 'text/plain');
      } catch (error) {
        fail(error);
      }
      return null;
    },
    submit: async ([doc]) => {
      await submit(doc);
      return null;
    },
    exportZip: (docs) => {
      exportScope({ kind: 'documents', documentIds: docs.map((d) => d.id) });
      return null;
    },
    print: async ([doc]) => {
      const { printDocument } = require('../../services/sharing/shareService') as typeof import('../../services/sharing/shareService');
      const annotations = store.getState().library.annotations.filter((a) => a.documentId === doc.id);
      try {
        await printDocument(doc, annotations);
      } catch (error) {
        fail(error);
      }
      return null;
    },
  };

  async function runPageToolFor(kind: 'merge' | 'split', docs: LibraryDocument[], options: ToolOptions): Promise<ToolResult> {
    const { library } = store.getState();
    try {
      const made = await runPageTool(kind, docs, !options.keepOriginals, {
        dispatch,
        annotations: library.annotations,
        submissions: library.submissions,
        open: openDocument,
        quiet: true,
      });
      return { tool: kind, docIds: made.map((d) => d.id) };
    } catch (error) {
      return fail(error);
    }
  }

  // The table is rebuilt every render (it closes over the hooks above); `run` keeps its identity.
  const latest = useRef(runners);
  latest.current = runners;
  const run = useCallback(async (tool: ToolDef, docs: LibraryDocument[], options: ToolOptions) => latest.current[tool.id](docs, options), []);

  const overlays = (
    <>
      {listActions.overlays}
      {backupOverlay}
      {convertPdf.element}
      {convertWord.element}
      {form.element}
      {editPages.overlays}
    </>
  );

  return { run, overlays };
}
