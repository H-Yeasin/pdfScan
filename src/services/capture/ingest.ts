import { File } from 'expo-file-system';
import { downscaleAndCompressPage } from '../enhance/enhanceService';
import { runOcr } from '../ocr/ocrService';
import type { EnhanceMode, OcrScript, SessionPage } from '../../types/models';
import { createId } from '../../utils/id';
import { MASTER_JPEG_Q, MASTER_MAX_DIM, THUMB_JPEG_Q, THUMB_MAX_DIM } from './imageSpec';

// Turns one raw capture (native scanner output or a gallery photo) into a session page: a master
// capped at MASTER_MAX_DIM, a small thumbnail, and scan-time OCR (used for the name suggestion;
// the saved document is OCR'd again on its final pixels). Shared by the scanner pipeline and
// gallery import so both get the same treatment. expo-image-manipulator does the decode, so EXIF
// orientation is baked in and any format the OS can decode (HEIC, PNG, ...) becomes a JPEG.
export async function ingestPage(
  rawUri: string,
  script: OcrScript,
  options: {
    deleteSource?: boolean;
    // The capture mode's default filter (see captureModes.ts).
    enhance?: EnhanceMode;
  } = {}
): Promise<SessionPage> {
  const master = await downscaleAndCompressPage(rawUri, MASTER_MAX_DIM, MASTER_JPEG_Q);
  if (options.deleteSource) {
    // The raw capture is fully superseded by the master - drop it now so peak cache usage stays
    // bounded during a long scan session.
    const raw = new File(rawUri);
    if (raw.exists) raw.delete();
  }
  const thumb = await downscaleAndCompressPage(master.uri, THUMB_MAX_DIM, THUMB_JPEG_Q);
  const ocr = await runOcr(master.uri, script);

  return {
    id: createId('page'),
    uri: master.uri,
    thumbUri: thumb.uri,
    width: master.width,
    height: master.height,
    rotation: 0,
    enhance: options.enhance ?? 'auto',
    ocr,
  };
}
