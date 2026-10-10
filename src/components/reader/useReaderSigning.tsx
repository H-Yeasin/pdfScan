import { useCallback, useMemo, useState } from 'react';
import { SignatureCaptureModal } from '../shared/SignatureCaptureModal';
import { SignatureModal } from '../shared/SignatureModal';
import { cleanTemporaryCache } from '../../services/persistence/libraryFiles';
import { applySignedPage } from '../../services/persistence/libraryOperations';
import { saveSignatureForReuse } from '../../services/signature/savedSignatureStorage';
import { createSignatureRow } from '../../services/signature/signatureRows';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { useT } from '../../i18n/useT';
import type { LibraryDocument } from '../../types/models';
import type { PlacedSignature, SurfaceSignRequest } from './surface/PageSurface';
import type { ReaderSheets } from './useReaderSheets';

type Options = {
  // The document, when it can be signed (formatCapabilities.canSign); else undefined.
  doc: LibraryDocument | undefined;
  // The library page being read (0-based): the page surface shows one at a time, also where the
  // PDF has two on a sheet, so that is the page that gets signed.
  idx: number;
  sheets: ReaderSheets;
};

// The Reader's Sign: drawing the signature, placing it, keeping it. §18 W1: the library page
// being signed is chosen when signing starts and carried in the sheet or tool that is open
// (readerSheets `idx`); everything in the flow uses it. Render `overlays` once.
// §18 W16 (A10): a PDF-format document is signed on the page being read (`request`, for
// PageSurface): the signature becomes an annotation row with its own copy of the PNG
// (signature/signatureRows), drawn live and written into whatever leaves the app. Neither
// document.pdf nor a page's master is touched. A JPG-format document still gets it flattened into
// the page (§18 W17, kept: its export is the page image, where a row has nowhere to go).
export function useReaderSigning({ doc, idx: readingIdx, sheets }: Options) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('signature');
  const { sheet, tool, open, close, openTool, closeTool } = sheets;
  const [captured, setCaptured] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const savedSignature = state.signature.saved;

  // Starts signing library page `idx`: on a PDF-format document the signature is captured, then
  // placed on the page; a JPG one has it flattened into the page's master.
  const startOn = useCallback(
    (idx: number) => {
      if (!doc) return;
      if (doc.format !== 'PDF') {
        openTool({ kind: 'signFlatten', idx });
      } else if (savedSignature) {
        setCaptured(savedSignature);
        openTool({ kind: 'signPlace', idx });
      } else {
        open({ kind: 'signCapture', idx });
      }
    },
    [doc, savedSignature, open, openTool]
  );

  const start = useCallback(() => {
    if (doc?.pages[readingIdx]) startOn(readingIdx);
  }, [doc, readingIdx, startOn]);

  const flattenIdx = tool?.kind === 'signFlatten' ? tool.idx : null;
  const placeIdx = tool?.kind === 'signPlace' ? tool.idx : null;
  const captureIdx = sheet?.kind === 'signCapture' ? sheet.idx : null;

  const handleFlattened = useCallback(
    async (flattenedUri: string) => {
      if (!doc || flattenIdx === null) return;
      const updated = await applySignedPage(doc, flattenIdx, flattenedUri);
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      closeTool();
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.signedPage', { page: flattenIdx + 1 }) });
    },
    [doc, flattenIdx, dispatch, closeTool, t]
  );

  const handleCaptured = useCallback(
    async (signature: { uri: string; aspectRatio: number }) => {
      if (captureIdx === null) return;
      const saved = await saveSignatureForReuse(signature.uri, signature.aspectRatio);
      // The drawing was a temporary file; the saved copy is the one placed, now and next time.
      cleanTemporaryCache([signature.uri]);
      dispatch({ type: 'signature/SET_SAVED', saved });
      setCaptured(saved);
      openTool({ kind: 'signPlace', idx: captureIdx });
    },
    [captureIdx, dispatch, openTool]
  );

  const handleRedraw = useCallback(() => {
    if (placeIdx === null) return;
    closeTool();
    open({ kind: 'signCapture', idx: placeIdx });
  }, [placeIdx, closeTool, open]);

  const handlePlacementCancel = useCallback(() => {
    closeTool();
    setCaptured(null);
  }, [closeTool]);

  // §18 W16: what the surface is asked to place, and its answer.
  const request = useMemo<SurfaceSignRequest | null>(
    () => (placeIdx !== null && captured ? { uri: captured.uri, aspectRatio: captured.aspectRatio, idx: placeIdx } : null),
    [placeIdx, captured]
  );
  const handleSurfacePlaced = useCallback(
    (idx: number, placed: PlacedSignature) => {
      if (!doc || !captured) return;
      try {
        const row = createSignatureRow(doc, idx, captured.uri, placed);
        if (!row) return;
        dispatch({ type: 'library/ADD_ANNOTATION', annotation: row });
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.placed', { page: idx + 1 }) });
      } catch (error) {
        console.warn('useReaderSigning: could not keep the signature', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.failed') });
      } finally {
        closeTool();
        setCaptured(null);
      }
    },
    [doc, captured, dispatch, closeTool, t]
  );

  const flattenPage = doc && flattenIdx !== null ? doc.pages[flattenIdx] : undefined;
  const overlays = (
    <>
      {flattenPage ? (
        <SignatureModal
          visible
          uri={flattenPage.fileUri}
          naturalWidth={flattenPage.width}
          naturalHeight={flattenPage.height}
          onCancel={closeTool}
          onConfirm={handleFlattened}
        />
      ) : null}

      {captureIdx !== null ? <SignatureCaptureModal visible onCancel={() => close('signCapture')} onCapture={handleCaptured} /> : null}
    </>
  );

  return { start, overlays, request, onPlaced: handleSurfacePlaced, onCancel: handlePlacementCancel, onRedraw: handleRedraw };
}
