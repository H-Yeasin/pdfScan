import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { DocTypePickerModal } from '../courses/DocTypeChips';
import { FolderPickerModal } from '../deliver/FolderPickerModal';
import { createId } from '../../utils/id';
import { SignatureCaptureModal } from '../shared/SignatureCaptureModal';
import { SignatureModal } from '../shared/SignatureModal';
import { SignaturePlacementOverlay } from '../shared/SignaturePlacementOverlay';
import { useBackupExport } from '../backup/useBackupExport';
import { useOpenCoverOptions } from './useCoverTarget';
import { compressDocuments, libraryOps, useDocumentActions } from './useDocumentActions';
import { blockedReason, rowMenuSections, type FileToolId } from './fileTools';
import { KeepOriginalsSheet, RenameSheet, TaskSheet, type KeepOriginalsAsk } from './FileSheets';
import { Menu } from '../ui';
import { useRouter } from '../../navigation/router';
import { saveSignatureForReuse } from '../../services/signature/savedSignatureStorage';
import { cleanTemporaryCache, deleteDocumentFiles } from '../../services/persistence/libraryFiles';
import { cancelDelete, scheduleDelete } from '../../services/library/pendingDeletes';
import { canSign } from '../../services/documents/formatCapabilities';
import { PdfEncryptedError } from '../../services/pdf/pdfErrors';
import { usePageImage } from '../shared/usePageImage';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { useSubmitDocument } from '../../store/useSubmitDocument';
import { docTypeOf } from '../../services/courses/docTypes';
import type { Dispatch } from 'react';
import type { AppAction } from '../../store/appReducer';
import type { Annotation, LibraryDocument, Submission } from '../../types/models';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';
import { hapticSelection } from '../../services/feedback/haptics';

// Opens a library document in the Reader and remembers it for Home's "Continue" card.
export function useOpenDocument() {
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  return useCallback(
    (doc: LibraryDocument) => {
      dispatch({ type: 'reader/SET_READER_ID', id: doc.id });
      dispatch({ type: 'settings/SET_LAST_OPENED', lastOpened: { id: doc.id, at: Date.now() } });
      go('reader');
    },
    [dispatch, go]
  );
}

// §14 Q5: asks, then removes the documents. The dispatch comes first so the list updates at once (and
// persistence deletes the rows; the pages' FTS rows go with them via the cascade and its trigger);
// the folders go after, one at a time. A folder that fails to delete is only an orphan, which
// Settings → Storage can clean, never a row whose files are gone.
export function confirmDelete(docs: readonly LibraryDocument[], dispatch: Dispatch<AppAction>): void {
  if (docs.length === 0) return;
  const count = docs.length;
  const single = count === 1 ? docs[0] : null;
  Alert.alert(
    single ? t('reader.deleteTitle') : t('library.deleteSelected.title', { count }),
    single ? t('reader.deleteBody', { name: single.name }) : t('library.deleteSelected.body', { count }),
    [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('library.deleteSelected.confirm'),
        style: 'destructive',
        onPress: () => {
          const ids = docs.map((d) => d.id);
          dispatch({ type: 'library/REMOVE_FILES', ids });
          for (const id of ids) {
            try {
              deleteDocumentFiles(id);
            } catch (error) {
              console.warn('confirmDelete: could not delete the files of', id, error);
            }
          }
          dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('library.deleted', { count }) });
        },
      },
    ]
  );
}

// What came of a merge or split, for the snack and the list.
type Made = { docs: LibraryDocument[]; annotations: Annotation[] };

// §17 U7: a merge or split, then the result in the list. Not a hook, so it is tested without
// rendering. Kept originals: the new documents are added beside them with copies of the marks, and
// the snack opens the result. Deleted originals: the new documents replace them at once (their
// rows follow the pages, as before U7), but their folders wait out the Undo window
// (pendingDeletes); Undo puts them back with their submissions and deletes what was made.
export async function runPageTool(
  kind: 'merge' | 'split',
  docs: LibraryDocument[],
  deleteOriginals: boolean,
  ctx: {
    dispatch: Dispatch<AppAction>;
    annotations: readonly Annotation[];
    submissions: readonly Submission[];
    open: (doc: LibraryDocument) => void;
    // §17 U8: the Tools tab shows the result in its own sheet, so a kept-originals run says nothing
    // and Files' selection is left alone. Deleting the originals still offers Undo.
    quiet?: boolean;
  }
): Promise<LibraryDocument[]> {
  const { dispatch } = ctx;
  const ops = libraryOps();
  const ids = docs.map((d) => d.id);
  const marks = ctx.annotations.filter((a) => ids.includes(a.documentId));
  let made: Made;
  if (deleteOriginals) {
    made = { docs: kind === 'merge' ? [await ops.mergeDocuments(docs, marks)] : await ops.splitDocument(docs[0], marks), annotations: [] };
  } else {
    made = kind === 'merge' ? await ops.mergeDocumentsKeeping(docs, marks) : await ops.splitDocumentKeeping(docs[0], marks);
  }
  const [first] = made.docs;
  const msg = kind === 'merge' ? t('library.mergedInto', { name: first.name }) : t('library.splitInto', { count: made.docs.length });

  if (deleteOriginals) {
    const submissions = ctx.submissions.filter((s) => ids.includes(s.documentId));
    dispatch({ type: 'library/REPLACE_FILES', ids, files: made.docs });
    const token = scheduleDelete(ids);
    dispatch({
      type: 'ui/SHOW_SNACK',
      msg,
      action: t('library.undo'),
      onAction: () => {
        if (!cancelDelete(token)) {
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('library.undoTooLate') });
          return;
        }
        const madeIds = made.docs.map((d) => d.id);
        dispatch({ type: 'library/REPLACE_FILES', ids: madeIds, files: docs, submissions });
        madeIds.forEach((id) => deleteDocumentFiles(id));
        dispatch({ type: 'libraryUi/REVEAL', id: docs[0].id });
      },
    });
  } else {
    dispatch({ type: 'library/ADD_FILES', files: made.docs, annotations: made.annotations });
    if (!ctx.quiet) dispatch({ type: 'ui/SHOW_SNACK', msg, action: t('library.open'), onAction: () => ctx.open(first) });
  }
  if (ctx.quiet) return made.docs;
  // The result, selected and scrolled to, so the next step (share it, move it) is one tap away.
  dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
  dispatch({ type: 'libraryUi/REVEAL', id: first.id, select: kind === 'merge' });
  return made.docs;
}

// What a document list does with its rows, shared by Files and the Course page: tap opens (or
// toggles, in selection mode), long-press starts selecting, the ⋯ opens the row's menu, and the
// selection bar's tools. Both the menu and the bar run through `runTool`. Selection lives in
// state.libraryUi, so it's one selection app-wide. Render `overlays` once in the screen: the menus,
// the sheets that ask first, the pickers and the signing overlays.
export function useDocumentListActions() {
  const dispatch = useAppDispatch();
  const { t: tr } = useT();
  const state = useAppSlices('library', 'libraryUi', 'signature');
  const { files } = state.library;
  const { selection, selMode } = state.libraryUi;
  const openDocument = useOpenDocument();
  const [menuDoc, setMenuDoc] = useState<LibraryDocument | null>(null);
  const [renameDoc, setRenameDoc] = useState<LibraryDocument | null>(null);
  const [typeTargets, setTypeTargets] = useState<LibraryDocument[] | null>(null);
  const [moveTargets, setMoveTargets] = useState<LibraryDocument[] | null>(null);
  const [keepAsk, setKeepAsk] = useState<KeepOriginalsAsk | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [signTarget, setSignTarget] = useState<LibraryDocument | null>(null);
  const [signStep, setSignStep] = useState<'capture' | 'place' | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const submit = useSubmitDocument();
  const { exportScope, overlay: backupOverlay } = useBackupExport();
  const openCoverOptions = useOpenCoverOptions();
  const documentActions = useDocumentActions();

  const selectedDocs = useMemo(() => files.filter((f) => selection.has(f.id)), [files, selection]);
  const snack = useCallback((msg: string) => dispatch({ type: 'ui/SHOW_SNACK', msg }), [dispatch]);

  const handlePressRow = useCallback(
    (doc: LibraryDocument) => {
      if (selMode) {
        dispatch({ type: 'libraryUi/TOGGLE_SELECTION', id: doc.id });
        return;
      }
      openDocument(doc);
    },
    [selMode, dispatch, openDocument]
  );

  const handleLongPress = useCallback(
    (doc: LibraryDocument) => {
      if (!selMode) hapticSelection();
      dispatch({ type: 'libraryUi/SET_SEL_MODE', on: true });
      dispatch({ type: 'libraryUi/TOGGLE_SELECTION', id: doc.id });
    },
    [dispatch, selMode]
  );

  const handleMore = useCallback((doc: LibraryDocument) => setMenuDoc(doc), []);

  const startSigning = useCallback(
    (target: LibraryDocument) => {
      setSignTarget(target);
      if (target.format !== 'PDF') return;
      if (state.signature.saved) {
        setCapturedSignature(state.signature.saved);
        setSignStep('place');
      } else {
        setSignStep('capture');
      }
    },
    [state.signature.saved]
  );

  const confirmPageTool = useCallback(
    async (ask: KeepOriginalsAsk, deleteOriginals: boolean) => {
      setBusy(ask.kind === 'merge' ? tr('library.merging') : tr('library.splitting'));
      try {
        await runPageTool(ask.kind, ask.docs, deleteOriginals, {
          dispatch,
          annotations: state.library.annotations,
          submissions: state.library.submissions,
          open: openDocument,
        });
      } catch (error) {
        console.warn('useDocumentListActions: page tool failed', ask.kind, error);
        snack(error instanceof PdfEncryptedError ? tr('library.passwordProtected') : tr('library.toolFailed'));
      } finally {
        setBusy(null);
      }
    },
    [dispatch, state.library.annotations, state.library.submissions, openDocument, snack, tr]
  );

  // One handler for a tool on some documents: the row menu passes its one, the selection bar the
  // selection. A tool that can't run says why instead (fileTools.blockedReason).
  const runTool = useCallback(
    async (id: FileToolId, docs: LibraryDocument[], from: 'menu' | 'selection') => {
      if (docs.length === 0) return;
      const [doc] = docs;
      // "Merge with…" from one row: pick the others, then Merge in the bar.
      if (id === 'merge' && from === 'menu') {
        dispatch({ type: 'libraryUi/SELECT_ALL', ids: [doc.id] });
        snack(tr('library.pickToMerge'));
        return;
      }
      const why = blockedReason(id, docs);
      if (why) {
        snack(tr(why));
        return;
      }
      switch (id) {
        case 'open':
          openDocument(doc);
          return;
        case 'share': {
          // One file goes as itself; several as a zip (§8 B3's Everything or PDFs only).
          if (docs.length > 1) {
            exportScope({ kind: 'documents', documentIds: docs.map((d) => d.id) });
            return;
          }
          const { shareDocument } = require('../../services/sharing/shareService') as typeof import('../../services/sharing/shareService');
          try {
            await shareDocument(doc, state.library.annotations.filter((a) => a.documentId === doc.id));
          } catch (error) {
            console.warn('useDocumentListActions: share failed', error);
            snack(tr('library.toolFailed'));
          }
          return;
        }
        case 'rename':
          setRenameDoc(doc);
          return;
        case 'move':
          setMoveTargets(docs);
          return;
        case 'star':
          documentActions.toggleStar(doc);
          return;
        case 'type':
          setTypeTargets(docs);
          return;
        case 'merge':
        case 'split':
          setKeepAsk({ kind: id, docs });
          return;
        case 'compress':
          setBusy(tr('library.compressing'));
          try {
            const msg = await compressDocuments(docs, dispatch);
            dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
            snack(msg);
          } catch (error) {
            console.warn('useDocumentListActions: compress failed', error);
            snack(error instanceof PdfEncryptedError ? tr('library.passwordProtected') : tr('library.toolFailed'));
          } finally {
            setBusy(null);
          }
          return;
        case 'sign':
          if (canSign(doc)) startSigning(doc);
          return;
        // §14 Q7: Academic options for this document.
        case 'cover':
          openCoverOptions(doc);
          return;
        case 'submit':
          dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
          await submit(doc);
          return;
        // Archive (or bring back, when all of them are archived). Only a flag: nothing moves.
        case 'archive': {
          const ids = docs.map((d) => d.id);
          const archived = !docs.every((d) => d.archived);
          dispatch({ type: 'library/SET_ARCHIVED', ids, archived });
          dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
          dispatch({
            type: 'ui/SHOW_SNACK',
            msg: archived ? tr('library.archivedSnack', { count: ids.length }) : tr('library.unarchivedSnack', { count: ids.length }),
            action: tr('library.undo'),
            onAction: () => dispatch({ type: 'library/SET_ARCHIVED', ids, archived: !archived }),
          });
          return;
        }
        // §8 B3: Everything or PDFs only, then share or save the zip.
        case 'export':
          exportScope({ kind: 'documents', documentIds: docs.map((d) => d.id) });
          dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
          return;
        // §14 Q5: any format, archived and password-protected ones too.
        case 'delete':
          confirmDelete(docs, dispatch);
          return;
      }
    },
    [dispatch, snack, tr, openDocument, exportScope, state.library.annotations, documentActions, startSigning, openCoverOptions, submit]
  );

  const handleSelectionTool = useCallback((id: FileToolId) => runTool(id, selectedDocs, 'selection'), [runTool, selectedDocs]);

  const handleSignConfirm = useCallback(
    async (flattenedUri: string) => {
      if (!signTarget) return;
      const updated = await libraryOps().applySignedPage(signTarget, 0, flattenedUri);
      dispatch({ type: 'library/UPDATE_FILE', id: signTarget.id, patch: updated });
      dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
      setSignTarget(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.signedPage', { page: 1 }) });
    },
    [signTarget, dispatch]
  );

  const handleSignatureCaptured = useCallback(
    async (signature: { uri: string; aspectRatio: number }) => {
      const saved = await saveSignatureForReuse(signature.uri, signature.aspectRatio);
      // The drawing was a temporary file; the saved copy is the one placed, now and next time.
      cleanTemporaryCache([signature.uri]);
      dispatch({ type: 'signature/SET_SAVED', saved });
      setCapturedSignature(saved);
      setSignStep('place');
    },
    [dispatch]
  );

  const handlePlacementCancel = useCallback(() => {
    setSignStep(null);
    setCapturedSignature(null);
    setSignTarget(null);
  }, []);

  // Page 1 to place the signature on: its master, or for an imported PDF the page rendered now.
  const signPage = usePageImage(signTarget, 0, signStep === 'place');

  const handlePlacementConfirm = useCallback(
    async (placement: { originX: number; originY: number; width: number; height: number }) => {
      if (!signTarget || !capturedSignature || !signPage) return;
      // §18 W16 (A10): a signature is a row with its own copy of the PNG
      // (signature/signatureRows): the Reader draws it and every copy that leaves the app
      // carries it, while document.pdf stays as it is.
      const { createSignatureRow, signatureOnPicture } = require('../../services/signature/signatureRows') as typeof import('../../services/signature/signatureRows');
      const placed = signatureOnPicture(signTarget, 0, placement, signPage);
      const row = placed ? createSignatureRow(signTarget, 0, capturedSignature.uri, placed) : null;
      if (row) {
        dispatch({ type: 'library/ADD_ANNOTATION', annotation: row });
      } else {
        // A page with no space to keep a row in (an imported page not indexed yet, a scan's
        // page inside a merged PDF): the signature is drawn into the page itself, which the
        // Reader then shows as part of it. The saved signature is only read.
        const updated = await libraryOps().applySignatureToDocument(signTarget, 0, capturedSignature.uri, placement, signPage);
        dispatch({ type: 'library/UPDATE_FILE', id: signTarget.id, patch: updated });
      }
      dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
      setSignStep(null);
      setCapturedSignature(null);
      setSignTarget(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.added') });
    },
    [signTarget, capturedSignature, signPage, dispatch]
  );

  // The picker marks a type only when every document it's for already has it.
  const firstType = typeTargets?.length ? docTypeOf(typeTargets[0]) : null;
  const sharedType = firstType && typeTargets!.every((d) => docTypeOf(d) === firstType) ? firstType : null;

  // The course every document being moved is in, if they share one (marked in the picker).
  const sharedCourseId =
    moveTargets?.length && moveTargets.every((d) => d.courseId === moveTargets[0].courseId) ? (moveTargets[0].courseId ?? null) : null;

  const overlays = (
    <>
      {backupOverlay}
      <Menu
        visible={menuDoc !== null}
        onClose={() => setMenuDoc(null)}
        title={menuDoc?.name}
        sections={menuDoc ? rowMenuSections(menuDoc, tr) : []}
        onSelect={(id) => {
          if (menuDoc) void runTool(id, [menuDoc], 'menu');
        }}
      />
      <RenameSheet doc={renameDoc} onClose={() => setRenameDoc(null)} onRename={(doc, name) => documentActions.rename(doc, name)} />
      <KeepOriginalsSheet ask={keepAsk} onClose={() => setKeepAsk(null)} onConfirm={(ask, del) => void confirmPageTool(ask, del)} />
      <TaskSheet label={busy} />

      <DocTypePickerModal
        visible={typeTargets !== null}
        title={typeTargets?.length === 1 ? tr('library.setType') : tr('library.setTypeFor', { count: typeTargets?.length ?? 0 })}
        value={sharedType}
        onSelect={(docType) => {
          if (typeTargets) dispatch({ type: 'library/SET_DOC_TYPE', ids: typeTargets.map((d) => d.id), docType });
          dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
        }}
        onClose={() => setTypeTargets(null)}
      />

      {/* "Move" (K6): documents under one course, or Unsorted (useDocumentActions). */}
      <FolderPickerModal
        visible={moveTargets !== null}
        courses={state.library.courses}
        selectedCourseId={sharedCourseId}
        onSelect={(courseId) => {
          if (moveTargets) documentActions.move(moveTargets, courseId);
          dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
        }}
        onCreate={(name) => {
          const id = createId('course');
          dispatch({ type: 'library/CREATE_COURSE', id, name });
          return id;
        }}
        onClose={() => setMoveTargets(null)}
      />

      {signTarget && signTarget.format === 'JPG' && (
        <SignatureModal
          visible
          uri={signTarget.pages[0].fileUri}
          naturalWidth={signTarget.pages[0].width}
          naturalHeight={signTarget.pages[0].height}
          onCancel={() => setSignTarget(null)}
          onConfirm={handleSignConfirm}
        />
      )}

      {signStep === 'capture' && (
        <SignatureCaptureModal visible onCancel={handlePlacementCancel} onCapture={handleSignatureCaptured} />
      )}

      {signStep === 'place' && signTarget && capturedSignature && signPage && (
        <SignaturePlacementOverlay
          pageUri={signPage.uri}
          pageNaturalWidth={signPage.width}
          pageNaturalHeight={signPage.height}
          signatureUri={capturedSignature.uri}
          signatureAspectRatio={capturedSignature.aspectRatio}
          onCancel={handlePlacementCancel}
          onConfirm={handlePlacementConfirm}
          onRedraw={() => setSignStep('capture')}
        />
      )}
    </>
  );

  return { selectedDocs, handlePressRow, handleLongPress, handleMore, handleSelectionTool, runTool, overlays };
}
