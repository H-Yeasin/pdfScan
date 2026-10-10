import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import type { EnhanceMode, IdCardSize, OcrScript, SessionPage, SourceImage } from '../../types/models';
import { composeIdCard } from '../enhance/composeIdCard';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import { ingestPage, pageFromMaster } from './ingest';

function filesOf(page: SessionPage): string[] {
  return page.thumbUri ? [page.uri, page.thumbUri] : [page.uri];
}

// Composes one ID card page from its card images: an A4 canvas (one encode), with a thumbnail and
// OCR of the composed page, laid out full-page so a 'real' size card prints at real size.
export async function composeIdCardPage(
  front: SourceImage,
  back: SourceImage | undefined,
  script: OcrScript,
  enhance: EnhanceMode,
  size?: IdCardSize
): Promise<SessionPage> {
  const composed = await composeIdCard(front, back, size);
  const page = await pageFromMaster(composed, script, { enhance });
  return { ...page, layout: 'fullPage', idCard: { front, back, size } };
}

// ID card mode post-processing for a batch: every two scanned pages become one composed page
// (front, back); an odd last page becomes a front-only card. The per-card session pages are
// dropped - their masters live on as `idCard.front/back`, only their thumbnails are deleted. If
// composing fails, that pair is kept as plain pages rather than lost.
export async function composeIdCardPages(pages: SessionPage[], script: OcrScript): Promise<SessionPage[]> {
  const result: SessionPage[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    const front = pages[i];
    const back = pages[i + 1] as SessionPage | undefined;
    try {
      const card = await composeIdCardPage(
        { uri: front.uri, width: front.width, height: front.height },
        back ? { uri: back.uri, width: back.width, height: back.height } : undefined,
        script,
        front.enhance
      );
      cleanTemporaryCache([front, back].flatMap((p) => (p?.thumbUri ? [p.thumbUri] : [])));
      result.push(card);
    } catch (error) {
      console.warn('composeIdCardPages: compose failed, keeping the scans as separate pages', error);
      result.push(front, ...(back ? [back] : []));
    }
  }
  return result;
}

// Swap front/back, replace the back, or change the size of an ID card page: recompose from the kept card images
// and return the patch for capture/UPDATE_PAGE. The old composed files are deleted.
export async function recomposeIdCard(
  page: SessionPage,
  next: { front: SourceImage; back?: SourceImage; size?: IdCardSize },
  script: OcrScript
): Promise<Partial<SessionPage>> {
  const card = await composeIdCardPage(next.front, next.back, script, page.enhance, next.size);
  cleanTemporaryCache(filesOf(page));
  return { uri: card.uri, thumbUri: card.thumbUri, width: card.width, height: card.height, ocr: card.ocr, ocrGeometry: card.ocrGeometry, idCard: card.idCard };
}

// "Retake back": one scanner page, ingested like any other capture (master spec, no OCR - the
// composed page gets OCR'd). Returns null if the user cancels.
export async function scanIdCardSide(script: OcrScript): Promise<SourceImage | null> {
  const result = await DocumentScanner.scanDocument({
    maxNumDocuments: 1,
    galleryImportAllowed: true,
    scannerMode: 'full',
    responseType: ResponseType.ImageFilePath,
  });
  const raw = result.scannedImages?.[0];
  if (result.status === ScanDocumentResponseStatus.Cancel || !raw) return null;
  const page = await ingestPage(raw, script, { deleteSource: true, ocr: false });
  if (page.thumbUri) cleanTemporaryCache([page.thumbUri]);
  return { uri: page.uri, width: page.width, height: page.height };
}
