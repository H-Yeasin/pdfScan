import { useCallback, useMemo, useState } from 'react';
import { DocTypePickerModal } from '../courses/DocTypeChips';
import { FolderPickerModal } from '../deliver/FolderPickerModal';
import { createId } from '../../utils/id';
import { SignatureCaptureModal } from '../shared/SignatureCaptureModal';
import { SignatureModal } from '../shared/SignatureModal';
import { SignaturePlacementOverlay } from '../shared/SignaturePlacementOverlay';
import type { SelectionToolId } from './SelectionBar';
import { useRouter } from '../../navigation/router';
import { saveSignatureForReuse } from '../../services/signature/savedSignatureStorage';
import {
  applySignedPage,
  applySignatureToDocument,
  compressDocument,
  mergeDocuments,
  splitDocument,
} from '../../services/persistence/libraryOperations';
import { deleteDocumentFiles } from '../../services/persistence/libraryFiles';
import { canSign } from '../../services/documents/formatCapabilities';
import { useAppState } from '../../store/AppStateContext';
import { useSubmitDocument } from '../../store/useSubmitDocument';
import { docTypeOf } from '../../services/courses/docTypes';
import type { LibraryDocument } from '../../types/models';

// Opens a library document in the Reader and remembers it for Home's "Continue" card.
export function useOpenDocument() {
  const { go } = useRouter();
  const { dispatch } = useAppState();
  return useCallback(
    (doc: LibraryDocument) => {
      dispatch({ type: 'reader/SET_READER_ID', id: doc.id });
      dispatch({ type: 'settings/SET_LAST_OPENED', lastOpened: { id: doc.id, at: Date.now() } });
      go('reader');
    },
    [dispatch, go]
  );
}

// What a document list does with its rows, shared by the Library and Course screens: tap opens
// (or toggles, in selection mode), long-press starts selecting, and the SelectionBar's tools
// (merge, split, compress, sign, set type). Selection lives in state.library, so it's one selection
// app-wide. Render `overlays` once in the screen: it holds the signing overlays and the type and course pickers.
export function useDocumentListActions() {
  const { state, dispatch } = useAppState();
  const { files, selection, selMode } = state.library;
  const openDocument = useOpenDocument();
  const [signTarget, setSignTarget] = useState<LibraryDocument | null>(null);
  const [signStep, setSignStep] = useState<'capture' | 'place' | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const submit = useSubmitDocument();

  const selectedDocs = useMemo(() => files.filter((f) => selection.includes(f.id)), [files, selection]);

  const handlePressRow = useCallback(
    (doc: LibraryDocument) => {
      if (selMode) {
        dispatch({ type: 'library/TOGGLE_SELECTION', id: doc.id });
        return;
      }
      openDocument(doc);
    },
    [selMode, dispatch, openDocument]
  );

  const handleLongPress = useCallback(
    (doc: LibraryDocument) => {
      dispatch({ type: 'library/SET_SEL_MODE', on: true });
      dispatch({ type: 'library/TOGGLE_SELECTION', id: doc.id });
    },
    [dispatch]
  );

  const handleSelectionTool = useCallback(
    async (id: SelectionToolId) => {
      if (selectedDocs.length === 0) return;

      if (id === 'type') {
        setTypePickerOpen(true);
        return;
      }

      if (id === 'move') {
        setMovePickerOpen(true);
        return;
      }

      // Archive (or bring back, when all of them are archived). Only a flag: nothing moves.
      if (id === 'archive') {
        const ids = selectedDocs.map((d) => d.id);
        const archived = !selectedDocs.every((d) => d.archived);
        dispatch({ type: 'library/SET_ARCHIVED', ids, archived });
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: `${ids.length} ${ids.length === 1 ? 'document' : 'documents'} ${archived ? 'archived' : 'back from the archive'}`,
          action: 'Undo',
          onAction: () => dispatch({ type: 'library/SET_ARCHIVED', ids, archived: !archived }),
        });
        return;
      }

      if (id === 'submit' && selectedDocs.length === 1) {
        dispatch({ type: 'library/CLEAR_SELECTION' });
        await submit(selectedDocs[0]);
        return;
      }

      if (id === 'merge' && selectedDocs.length >= 2) {
        const merged = await mergeDocuments(selectedDocs);
        selectedDocs.forEach((doc) => deleteDocumentFiles(doc.id));
        dispatch({ type: 'library/REPLACE_FILES', ids: selection, files: [merged] });
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: `${selectedDocs.length} files merged` });
      } else if (id === 'split' && selectedDocs.length === 1) {
        const [doc] = selectedDocs;
        const split = await splitDocument(doc);
        deleteDocumentFiles(doc.id);
        dispatch({ type: 'library/REPLACE_FILES', ids: [doc.id], files: split });
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: `Split into ${split.length} files` });
      } else if (id === 'compress') {
        for (const doc of selectedDocs) {
          const compressed = await compressDocument(doc, undefined, state.library.annotations.filter((a) => a.documentId === doc.id));
          dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: compressed });
        }
        dispatch({ type: 'library/CLEAR_SELECTION' });
        dispatch({ type: 'ui/SHOW_SNACK', msg: 'Compressed · done' });
      } else if (id === 'sign' && selectedDocs.length === 1 && canSign(selectedDocs[0])) {
        const [target] = selectedDocs;
        setSignTarget(target);
        if (target.format === 'PDF') {
          if (state.signature.saved) {
            setCapturedSignature(state.signature.saved);
            setSignStep('place');
          } else {
            setSignStep('capture');
          }
        }
      }
    },
    [selectedDocs, selection, dispatch, state.signature.saved, state.library.annotations, submit]
  );

  const handleSignConfirm = useCallback(
    async (flattenedUri: string) => {
      if (!signTarget) return;
      const updated = await applySignedPage(
        signTarget,
        0,
        flattenedUri,
        state.library.annotations.filter((a) => a.documentId === signTarget.id)
      );
      dispatch({ type: 'library/UPDATE_FILE', id: signTarget.id, patch: updated });
      dispatch({ type: 'library/CLEAR_SELECTION' });
      setSignTarget(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Signed · page 1' });
    },
    [signTarget, dispatch, state.library.annotations]
  );

  const handleSignatureCaptured = useCallback(
    async (signature: { uri: string; aspectRatio: number }) => {
      const saved = await saveSignatureForReuse(signature.uri, signature.aspectRatio);
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

  const handlePlacementConfirm = useCallback(
    async (placement: { originX: number; originY: number; width: number; height: number }) => {
      if (!signTarget || !capturedSignature) return;
      const updated = await applySignatureToDocument(signTarget, 0, capturedSignature.uri, placement);
      dispatch({ type: 'library/UPDATE_FILE', id: signTarget.id, patch: updated });
      dispatch({ type: 'library/CLEAR_SELECTION' });
      setSignStep(null);
      setCapturedSignature(null);
      setSignTarget(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Signature added — visible in exported PDF' });
    },
    [signTarget, capturedSignature, dispatch]
  );

  // The picker marks a type only when every selected document already has it.
  const firstType = selectedDocs.length > 0 ? docTypeOf(selectedDocs[0]) : null;
  const sharedType = firstType && selectedDocs.every((d) => docTypeOf(d) === firstType) ? firstType : null;

  // The course every selected document is in, if they share one (marked in the picker).
  const sharedCourseId =
    selectedDocs.length > 0 && selectedDocs.every((d) => d.courseId === selectedDocs[0].courseId) ? (selectedDocs[0].courseId ?? null) : null;

  const overlays = (
    <>
      <DocTypePickerModal
        visible={typePickerOpen}
        title={selectedDocs.length === 1 ? 'Set type' : `Set type for ${selectedDocs.length} documents`}
        value={sharedType}
        onSelect={(docType) => {
          dispatch({ type: 'library/SET_DOC_TYPE', ids: selectedDocs.map((d) => d.id), docType });
          dispatch({ type: 'library/CLEAR_SELECTION' });
        }}
        onClose={() => setTypePickerOpen(false)}
      />

      {/* "Move" (K6): files a whole selection under one course, or Unsorted. Only the course id
          changes, never the files, so it's one quick write however many are moved. */}
      <FolderPickerModal
        visible={movePickerOpen}
        courses={state.library.courses}
        selectedCourseId={sharedCourseId}
        onSelect={(courseId) => {
          const ids = selectedDocs.map((d) => d.id);
          dispatch({ type: 'library/ASSIGN_COURSE', ids, courseId });
          dispatch({ type: 'library/CLEAR_SELECTION' });
          const name = courseId ? state.library.courses.find((c) => c.id === courseId)?.name : 'Unsorted';
          dispatch({ type: 'ui/SHOW_SNACK', msg: `Moved ${ids.length} to ${name ?? 'course'}` });
        }}
        onCreate={(name) => {
          const id = createId('course');
          dispatch({ type: 'library/CREATE_COURSE', id, name });
          return id;
        }}
        onClose={() => setMovePickerOpen(false)}
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

      {signStep === 'place' && signTarget && capturedSignature && (
        <SignaturePlacementOverlay
          pageUri={signTarget.pages[0].fileUri}
          pageNaturalWidth={signTarget.pages[0].width}
          pageNaturalHeight={signTarget.pages[0].height}
          signatureUri={capturedSignature.uri}
          signatureAspectRatio={capturedSignature.aspectRatio}
          onCancel={handlePlacementCancel}
          onConfirm={handlePlacementConfirm}
          onRedraw={() => setSignStep('capture')}
        />
      )}
    </>
  );

  return { selectedDocs, handlePressRow, handleLongPress, handleSelectionTool, overlays };
}
