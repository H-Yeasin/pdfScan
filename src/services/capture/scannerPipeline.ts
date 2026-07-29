import type { Dispatch } from 'react';
import { File } from 'expo-file-system';
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import type { AppAction } from '../../store/appReducer';
import { downscaleAndCompressPage } from '../enhance/enhanceService';
import { runOcr } from '../ocr/ocrService';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import type { SessionPage } from '../../types/models';
import { createId } from '../../utils/id';

const MAX_PAGES = 50;
const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Orchestrates the whole scan session outside the reducer, committing state only at clean
// transition points (scanning -> processing -> one bulk commit -> success/error) instead of
// once per page, so the Context doesn't re-render mid-scan.
export async function runNativeScannerPipeline(dispatch: Dispatch<AppAction>): Promise<void> {
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'scanning' });

  let scannedImages: string[];
  try {
    const result = await DocumentScanner.scanDocument({
      maxNumDocuments: MAX_PAGES,
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
      const compressed = await downscaleAndCompressPage(rawUri, MAX_DIMENSION, JPEG_QUALITY);

      // The raw pre-compression scan is now fully superseded by `compressed` — delete it
      // immediately rather than waiting for session end, so peak disk/cache usage stays bounded.
      const rawFile = new File(rawUri);
      if (rawFile.exists) rawFile.delete();

      const ocr = await runOcr(compressed.uri);

      processedPages.push({
        id: createId('page'),
        uri: compressed.uri,
        width: compressed.width,
        height: compressed.height,
        rotation: 0,
        enhance: 'auto',
        ocr,
      });
    }
  } catch (error) {
    // Pages compressed before the failure were never committed to state — don't orphan them.
    cleanTemporaryCache(processedPages.map((p) => p.uri));
    dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'error', errorMessage: errorMessage(error) });
    return;
  }

  dispatch({ type: 'capture/BULK_ADD_PAGES', pages: processedPages });
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'success' });
}
