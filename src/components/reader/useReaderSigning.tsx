import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { SignatureCaptureModal } from '../shared/SignatureCaptureModal';
import { SignatureModal } from '../shared/SignatureModal';
import { SignaturePlacementOverlay } from '../shared/SignaturePlacementOverlay';
import { usePageImage } from '../shared/usePageImage';
import { cleanTemporaryCache } from '../../services/persistence/libraryFiles';
import { applySignedPage, applySignatureToDocument } from '../../services/persistence/libraryOperations';
import { saveSignatureForReuse } from '../../services/signature/savedSignatureStorage';
import { signTargets, type SignaturePlacement } from '../../services/signature/signaturePlacement';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { useT } from '../../i18n/useT';
import type { LibraryDocument } from '../../types/models';
import type { ReaderSheets } from './useReaderSheets';

type Options = {
  // The document, when it can be signed (formatCapabilities.canSign); else undefined.
  doc: LibraryDocument | undefined;
  // The PDF page on screen (1-based).
  pdfPage: number;
  sheets: ReaderSheets;
};

// The Reader's Sign: which page, drawing the signature, placing it, writing it. §18 W1: the
// library page being signed is chosen when signing starts and carried in the sheet or tool that
// is open (readerSheets `idx`). Everything in the flow uses it (the page shown for placing, the
// page written, the snack), never the PDF page on screen: after a cover or on a 2-in-1 sheet the
// two numbers differ. Render `overlays` once.
export function useReaderSigning({ doc, pdfPage, sheets }: Options) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'signature');
  const { sheet, tool, open, close, openTool, closeTool } = sheets;
  const [captured, setCaptured] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const savedSignature = state.signature.saved;

  // Starts signing library page `idx`: a PDF-format document gets the signature drawn onto its
  // PDF page (capture, then place); a JPG one has it flattened into the page's master.
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
    if (!doc) return;
    // The library pages on the PDF page on screen. A 2-in-1 sheet shows two: ask which one.
    const targets = signTargets(doc, pdfPage);
    if (targets.length > 1) {
      Alert.alert(t('reader.signWhichPage'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        ...targets.map((idx) => ({ text: t('reader.signPage', { page: idx + 1 }), onPress: () => startOn(idx) })),
      ]);
    } else if (targets.length === 1) {
      startOn(targets[0]);
    }
  }, [doc, pdfPage, startOn, t]);

  const flattenIdx = tool?.kind === 'signFlatten' ? tool.idx : null;
  const placeIdx = tool?.kind === 'signPlace' ? tool.idx : null;
  const captureIdx = sheet?.kind === 'signCapture' ? sheet.idx : null;

  const handleFlattened = useCallback(
    async (flattenedUri: string) => {
      if (!doc || flattenIdx === null) return;
      const updated = await applySignedPage(
        doc,
        flattenIdx,
        flattenedUri,
        state.library.annotations.filter((a) => a.documentId === doc.id)
      );
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      closeTool();
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.signedPage', { page: flattenIdx + 1 }) });
    },
    [doc, flattenIdx, dispatch, state.library.annotations, closeTool, t]
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

  // The page the signature is placed on: its master, or for an imported PDF the page rendered now.
  const signPage = usePageImage(doc, placeIdx ?? 0, placeIdx !== null);

  const handlePlaced = useCallback(
    async (placement: SignaturePlacement) => {
      if (!doc || placeIdx === null || !captured || !signPage) return;
      const updated = await applySignatureToDocument(doc, placeIdx, captured.uri, placement, signPage);
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      closeTool();
      setCaptured(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.added') });
    },
    [doc, placeIdx, captured, signPage, dispatch, closeTool, t]
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

      {placeIdx !== null && captured && signPage ? (
        <SignaturePlacementOverlay
          pageUri={signPage.uri}
          pageNaturalWidth={signPage.width}
          pageNaturalHeight={signPage.height}
          signatureUri={captured.uri}
          signatureAspectRatio={captured.aspectRatio}
          onCancel={handlePlacementCancel}
          onConfirm={handlePlaced}
          onRedraw={handleRedraw}
        />
      ) : null}
    </>
  );

  return { start, overlays };
}
