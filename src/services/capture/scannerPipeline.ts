import type { Dispatch } from 'react';
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import { t } from '../../i18n';
import type { AppAction } from '../../store/appReducer';
import type { CaptureModeSpec } from './captureModes';
import { ingestBatch } from './ingestBatch';
import { isScannerUnavailableError, runCameraFallback, scannerUnavailableMessage } from './scannerFallback';
import { hapticPagesReceived, hapticWarning } from '../feedback/haptics';
import type { OcrScript } from '../../types/models';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Orchestrates a scan session outside the reducer: scanning -> processing (per-page progress,
// cancellable, each page added as it finishes, see ingestBatch.ts) -> success/error.
export async function runNativeScannerPipeline(
  dispatch: Dispatch<AppAction>,
  script: OcrScript,
  spec: CaptureModeSpec,
  // settings.scannerUnavailable: skip straight to the basic camera (scannerFallback.ts).
  options: { scannerUnavailable?: boolean } = {}
): Promise<void> {
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'scanning' });
  // "Scan more" relaunches in the same mode; the new pages go to the end.
  const scanMore = () => {
    void runNativeScannerPipeline(dispatch, script, spec, options);
  };

  if (options.scannerUnavailable) {
    await runCameraFallback(dispatch, script, spec, scanMore);
    return;
  }

  dispatch({
    type: 'ui/SHOW_SNACK',
    msg: t('capture.scannerTip'),
  });

  let scannedImages: string[];
  try {
    // Edge detection, auto-capture on a steady quadrilateral, and perspective-correction
    // cropping all happen inside Google's closed-source on-device Document Scanner
    // (Play Services GmsDocumentScanner) — this app has no code path into or visibility over
    // that internal logic. Our patch (patches/react-native-document-scanner-plugin+*.patch)
    // exposes the scanner's own options: the mode's page limit, and gallery import so students
    // can pull e.g. WhatsApp photos through the same edge detection. Android only; iOS's
    // VisionKit scanner ignores both.
    const result = await DocumentScanner.scanDocument({
      maxNumDocuments: spec.pageLimit,
      galleryImportAllowed: true,
      scannerMode: 'full',
      responseType: ResponseType.ImageFilePath,
    });

    if (result.status === ScanDocumentResponseStatus.Cancel || !result.scannedImages?.length) {
      dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
      return;
    }
    scannedImages = result.scannedImages;
  } catch (error) {
    if (isScannerUnavailableError(error)) {
      // Remembered (persisted), so later scans skip the doomed attempt; the explanation shows
      // only this once.
      dispatch({ type: 'settings/SET_SCANNER_UNAVAILABLE', unavailable: true });
      dispatch({ type: 'ui/SHOW_SNACK', msg: scannerUnavailableMessage() });
      await runCameraFallback(dispatch, script, spec, () => {
        void runNativeScannerPipeline(dispatch, script, spec, { scannerUnavailable: true });
      });
      return;
    }
    hapticWarning();
    dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'error', errorMessage: errorMessage(error) });
    return;
  }

  hapticPagesReceived();
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });

  await ingestBatch(dispatch, scannedImages, { script, spec, ownsInputs: true, onScanMore: scanMore });
}
