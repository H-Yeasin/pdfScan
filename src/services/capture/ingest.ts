import { File } from 'expo-file-system';
import { downscaleAndCompressPage } from '../enhance/enhanceService';
import { analyzeImageUri } from '../enhance/filters/stats';
import { runOcr } from '../ocr/ocrService';
import type { EnhanceMode, OcrScript, SessionPage } from '../../types/models';
import { createId } from '../../utils/id';
import { masterGeometryKey } from './geometryKey';
import { MASTER_JPEG_Q, MASTER_MAX_DIM, THUMB_JPEG_Q, THUMB_MAX_DIM } from './imageSpec';

// Turns one raw capture (native scanner output or a gallery photo) into a session page: a master
// capped at MASTER_MAX_DIM, a small thumbnail, and scan-time OCR (used for the name suggestion, and
// kept for the saved document while the page's geometry stays the same: geometryKey.ts). Shared by the scanner pipeline and
// gallery import so both get the same treatment. expo-image-manipulator does the decode, so EXIF
// orientation is baked in and any format the OS can decode (HEIC, PNG, ...) becomes a JPEG.
export async function ingestPage(
  rawUri: string,
  script: OcrScript,
  options: {
    deleteSource?: boolean;
    // The capture mode's default filter (see captureModes.ts).
    enhance?: EnhanceMode;
    // false: the master and thumbnail only. For a page that's about to be post-processed (split,
    // composed), and for a batch (§16 G7), which shows the page first and reads it afterwards
    // (readPage).
    ocr?: boolean;
  } = {}
): Promise<SessionPage> {
  const master = await downscaleAndCompressPage(rawUri, MASTER_MAX_DIM, MASTER_JPEG_Q);
  if (options.deleteSource) {
    // The raw capture is fully superseded by the master - drop it now so peak cache usage stays
    // bounded during a long scan session.
    const raw = new File(rawUri);
    if (raw.exists) raw.delete();
  }
  return pageFromMaster(master, script, { enhance: options.enhance, ocr: options.ocr });
}

// Wraps an already-final master (e.g. one half of a split spread) as a session page: a thumbnail,
// then (unless `ocr` is false) filter stats and OCR. Never re-encodes the master itself.
export async function pageFromMaster(
  master: { uri: string; width: number; height: number },
  script: OcrScript,
  options: { enhance?: EnhanceMode; ocr?: boolean } = {}
): Promise<SessionPage> {
  const thumb = await downscaleAndCompressPage(master.uri, THUMB_MAX_DIM, THUMB_JPEG_Q);
  const read = options.ocr === false ? null : await readPage(master, script);

  return {
    id: createId('page'),
    uri: master.uri,
    thumbUri: thumb.uri,
    width: master.width,
    height: master.height,
    rotation: 0,
    enhance: options.enhance ?? 'auto',
    ...read,
  };
}

export type PageReading = Pick<SessionPage, 'stats' | 'ocr' | 'ocrGeometry'>;

// The slow half of ingesting a page: its filter stats (measured once here so switching filters in
// Review never reads pixels again) and its text. Both are best-effort and never throw.
export async function readPage(master: { uri: string; width: number; height: number }, script: OcrScript): Promise<PageReading> {
  const stats = await analyzeImageUri(master.uri);
  const ocr = await runOcr(master.uri, script);
  return { stats, ocr, ocrGeometry: ocr ? masterGeometryKey(master, script) : undefined };
}
