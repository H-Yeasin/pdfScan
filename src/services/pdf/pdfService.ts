import 'react-native-get-random-values'; // pdf-lib needs crypto.getRandomValues; also imported at the app entrypoint, but kept here too so this module is safe even if ever imported outside that graph (e.g. a future test file)
import { File } from 'expo-file-system';
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { compressPage } from '../enhance/enhanceService';
import { getDocumentDir } from '../persistence/libraryFiles';
import type { OcrLine, PageOcr } from '../../types/models';

// A page's longer pixel dimension is mapped to this many PDF points, so each page's MediaBox
// stays exactly proportional to its source image (replaces the old fixed 612x792 + letterboxing)
// while still landing close to familiar Letter/A4 proportions for typical portrait scans.
const PDF_LONG_SIDE_PT = 792;

// Heuristics for turning an OCR line's pixel box into an invisible text run. ML Kit's line
// bounding box doesn't map 1:1 to any single font metric (cap-height vs ascender/descender vs
// line-height all disagree) - these are starting points to be tuned from visual QA, not derived
// constants. They only affect where the invisible, selectable text sits; the visible page is
// unaffected either way.
const FONT_SIZE_TO_BOX_HEIGHT_RATIO = 0.85;
const BASELINE_INSET_RATIO = 0.2;

export type PdfSourcePage = {
  uri: string;
  width: number;
  height: number;
  ocr?: PageOcr;
};

function pageScale(widthPx: number, heightPx: number): number {
  return PDF_LONG_SIDE_PT / Math.max(widthPx, heightPx);
}

// PDF's origin is bottom-left; OCR `top` is measured from the image's top edge, hence the flip.
function drawOcrLine(pdfPage: PDFPage, line: OcrLine, scale: number, pageHeightPt: number, font: PDFFont): void {
  const text = line.text.trim();
  if (!text) return;

  const { left, top, height } = line.bounding;
  const boxHeightPt = height * scale;
  if (!(boxHeightPt > 0)) return;

  const x = left * scale;
  const y = pageHeightPt - (top + height) * scale + boxHeightPt * BASELINE_INSET_RATIO;
  const size = boxHeightPt * FONT_SIZE_TO_BOX_HEIGHT_RATIO;

  try {
    // opacity: 0 is the mechanism pdf-lib's public API actually exposes for invisible-but-
    // selectable text (there is no direct "Tr 3" render-mode option) - text drawn this way is
    // never rendered but its glyphs and positions remain in the content stream for search/select.
    pdfPage.drawText(text, { x, y, size, font, opacity: 0 });
  } catch (error) {
    // Helvetica only supports WinAnsi encoding; ML Kit's Latin-script OCR can still occasionally
    // emit a character outside it. One bad line shouldn't sink the rest of the page's searchable
    // text - same best-effort philosophy as ocrService.ts's own try/catch around OCR itself.
    console.warn('pdfService: skipping unencodable OCR line', error);
  }
}

function drawOcrLayer(pdfPage: PDFPage, ocr: PageOcr, scale: number, pageHeightPt: number, font: PDFFont): void {
  for (const block of ocr.blocks) {
    for (const line of block.lines) drawOcrLine(pdfPage, line, scale, pageHeightPt, font);
  }
}

// Recompresses the page's JPEG at the requested quality, embeds the resulting bytes, and deletes
// the transient recompressed file - no page holds more than one raw image buffer at a time
// before pdf-lib takes ownership of the bytes, and nothing is ever base64-inflated.
async function embedPageImage(pdfDoc: PDFDocument, uri: string, compressQuality: number) {
  const compressed = await compressPage(uri, compressQuality);
  try {
    const bytes = await new File(compressed.uri).bytes();
    return await pdfDoc.embedJpg(bytes);
  } finally {
    const tempFile = new File(compressed.uri);
    if (tempFile.exists) tempFile.delete();
  }
}

export async function buildPdfFromPages(
  documentId: string,
  pages: PdfSourcePage[],
  quality: number
): Promise<{ uri: string; sizeBytes: number }> {
  const compressQuality = 0.2 + (quality - 1) * 0.2; // quality 1-5 -> 0.2-1.0, same convention as enhanceService/imageExportService

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Sequential loop on purpose - a Promise.all here would hold every page's raw JPEG bytes in
  // memory at once, defeating the point (same rationale as scannerPipeline.ts's own OCR loop).
  for (const page of pages) {
    const jpgImage = await embedPageImage(pdfDoc, page.uri, compressQuality);

    const scale = pageScale(page.width, page.height);
    const pageWidthPt = page.width * scale;
    const pageHeightPt = page.height * scale;

    const pdfPage = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    pdfPage.drawImage(jpgImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });

    if (page.ocr && page.ocr.blocks.length > 0) {
      drawOcrLayer(pdfPage, page.ocr, scale, pageHeightPt, font);
    }
  }

  const pdfBytes = await pdfDoc.save();

  const dir = getDocumentDir(documentId);
  const dest = new File(dir, 'document.pdf');
  if (dest.exists) dest.delete();
  dest.write(pdfBytes);

  return { uri: dest.uri, sizeBytes: dest.size ?? 0 };
}

export function estimateSizeBytes(pages: PdfSourcePage[], quality: number): number {
  const rawBytes = pages.reduce((sum, page) => sum + (new File(page.uri).size ?? 0), 0);
  const qualityMultiplier = 0.2 + (quality - 1) * 0.2; // quality 1-5 -> 0.2-1.0
  return Math.round(rawBytes * qualityMultiplier);
}
