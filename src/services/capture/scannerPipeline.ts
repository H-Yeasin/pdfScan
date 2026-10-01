import type { Dispatch } from 'react';
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import type { AppAction } from '../../store/appReducer';
import type { CaptureModeSpec } from './captureModes';
import { ingestPage } from './ingest';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import type { OcrScript, SessionPage } from '../../types/models';


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Orchestrates the whole scan session outside the reducer, committing state only at clean
// transition points (scanning -> processing -> one bulk commit -> success/error) instead of
// once per page, so the Context doesn't re-render mid-scan.
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
    dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'error', errorMessage: errorMessage(error) });
    return;
  }

  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });

  const processedPages: SessionPage[] = [];

  try {
    // Sequential on purpose: each raw scan can be 4K+/12MB+. Running these concurrently
    // (Promise.all) risks OOM-killing the app on mid-range Android devices.
    for (const rawUri of scannedImages) {
      processedPages.push(await ingestPage(rawUri, script, { deleteSource: true, enhance: spec.defaultEnhance }));
    }
  } catch (error) {
    // Pages compressed before the failure were never committed to state — don't orphan them.
    cleanTemporaryCache(processedPages.flatMap((p) => (p.thumbUri ? [p.uri, p.thumbUri] : [p.uri])));
    dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'error', errorMessage: errorMessage(error) });
    return;
  }

  dispatch({ type: 'capture/BULK_ADD_PAGES', pages: processedPages });
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'success' });
}
