import type { Dispatch } from 'react';
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import type { AppAction } from '../../store/appReducer';
import type { CaptureModeSpec } from './captureModes';
import { ingestBatch } from './ingestBatch';
import { hapticPagesReceived, hapticWarning } from '../feedback/haptics';
import type { OcrScript } from '../../types/models';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Orchestrates a scan session outside the reducer: scanning -> processing (per-page progress,
// cancellable, see ingestBatch.ts) -> one bulk commit -> success/error.
export async function runNativeScannerPipeline(
  dispatch: Dispatch<AppAction>,
  script: OcrScript,
  spec: CaptureModeSpec
): Promise<void> {
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'scanning' });

  dispatch({
    type: 'ui/SHOW_SNACK',
    msg: 'Align the notebook page inside the camera frame and hold steady for auto-capture.',
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
    hapticWarning();
    dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'error', errorMessage: errorMessage(error) });
    return;
  }

  hapticPagesReceived();
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });

  // "Scan more" relaunches the scanner in the same mode; BULK_ADD_PAGES appends.
  await ingestBatch(dispatch, scannedImages, {
    script,
    spec,
    ownsInputs: true,
    onScanMore: () => {
      void runNativeScannerPipeline(dispatch, script, spec);
    },
  });
}
