import 'react-native-get-random-values'; // pdf-lib needs crypto.getRandomValues; also imported at the app entrypoint, but kept here too so this module is safe even if ever imported outside that graph (e.g. a future test file)
import { File } from 'expo-file-system';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
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

// --- Academic export tuning ---
const COVER_TEMPLATE_WIDTH_PT = 612; // US Letter width
const COVER_TEMPLATE_HEIGHT_PT = PDF_LONG_SIDE_PT; // reuse the existing 792pt long-side convention
const STAMP_INSET_PT = 25;
const STAMP_BORDER_WIDTH_PT = 1.5;
const HEADER_Y_FROM_TOP_PT = 40;
const FOOTER_Y_PT = 30;
const HEADER_FONT_SIZE = 9;
const FOOTER_FONT_SIZE = 9;
const COVER_TITLE_FONT_SIZE = 24;
const COVER_SUBTITLE_FONT_SIZE = 14;
const COVER_META_FONT_SIZE = 12;

export type PdfSourcePage = {
  uri: string;
  width: number;
  height: number;
  ocr?: PageOcr;
};

export type CoverPageConfig = {
  mode: 'template' | 'imported_image';
  title?: string;
  studentName?: string;
  courseCode?: string;
  importedUri?: string; // local URI of a gallery-imported image (imported_image mode only)
};

export type AcademicConfig = {
  enableBorder: boolean;
  headerText?: string;
  footerText?: string; // e.g. "Page {X} of {Y}" - {X}/{Y} are replaced with content-page numbers
  coverPage?: CoverPageConfig;
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

// Gallery-imported URIs (esp. Android content:// URIs) can't be trusted to carry a reliable file
// extension, so the image kind is sniffed from the PNG magic byte signature on the already-read
// buffer instead - anything else is treated as JPEG, the only two formats embedPng/embedJpg support.
function sniffImageKind(bytes: Uint8Array): 'png' | 'jpg' {
  const isPng =
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return isPng ? 'png' : 'jpg';
}

// Builds the academic cover page and appends it to `pdfDoc` via addPage(), so it becomes page
// index 0. Must be called BEFORE the per-content-page loop in buildPdfFromPages runs - see the
// invariant comment above that loop for why prepending a page here is guaranteed not to affect
// any content page's OCR text coordinates.
async function buildCoverPage(pdfDoc: PDFDocument, cover: CoverPageConfig): Promise<void> {
  if (cover.mode === 'imported_image') {
    if (!cover.importedUri) {
      console.warn('pdfService: cover mode "imported_image" with no importedUri, skipping cover page');
      return;
    }
    try {
      const bytes = await new File(cover.importedUri).bytes();
      const kind = sniffImageKind(bytes);
      const image = kind === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

      // Reuse the same long-side scaling convention as content pages so a photographed cover
      // sheet ends up proportioned like the rest of the deck instead of an arbitrary size.
      const scale = pageScale(image.width, image.height);
      const pageWidthPt = image.width * scale;
      const pageHeightPt = image.height * scale;

      const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
      page.drawImage(image, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });
    } catch (error) {
      // A bad/missing imported cover image must never sink the whole export - same best-effort
      // philosophy as drawOcrLine's catch above. Fall back to no cover page at all.
      console.warn('pdfService: failed to embed imported cover image, skipping cover page', error);
    }
    return;
  }

  // mode === 'template'
  const page = pdfDoc.addPage([COVER_TEMPLATE_WIDTH_PT, COVER_TEMPLATE_HEIGHT_PT]);
  const titleFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const drawCentered = (text: string, y: number, font: PDFFont, size: number) => {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (COVER_TEMPLATE_WIDTH_PT - width) / 2, y, size, font });
  };

  // Fields are optional and drawn independently, so an all-empty config degrades to a blank
  // Letter-sized page rather than an error. Vertical anchors are relative to page height so the
  // layout holds even if COVER_TEMPLATE_HEIGHT_PT changes.
  if (cover.title) drawCentered(cover.title, COVER_TEMPLATE_HEIGHT_PT * 0.4, titleFont, COVER_TITLE_FONT_SIZE);
  if (cover.studentName) {
    drawCentered(cover.studentName, COVER_TEMPLATE_HEIGHT_PT * 0.4 - 40, bodyFont, COVER_SUBTITLE_FONT_SIZE);
  }
  if (cover.courseCode) {
    drawCentered(cover.courseCode, COVER_TEMPLATE_HEIGHT_PT * 0.4 - 64, bodyFont, COVER_META_FONT_SIZE);
  }
}

// Draws the optional border/header/footer onto one CONTENT page (never the cover page - the
// cover is built separately by buildCoverPage and excluded from this stamping and from the
// "Page X of Y" count entirely). Takes this call's own pageWidthPt/pageHeightPt rather than a
// fixed size, matching the existing per-page-variable-size architecture.
function stampAcademicPage(
  pdfPage: PDFPage,
  pageWidthPt: number,
  pageHeightPt: number,
  font: PDFFont,
  config: AcademicConfig,
  contentPageNumber: number,
  totalContentPages: number
): void {
  if (config.enableBorder) {
    pdfPage.drawRectangle({
      x: STAMP_INSET_PT,
      y: STAMP_INSET_PT,
      width: pageWidthPt - STAMP_INSET_PT * 2,
      height: pageHeightPt - STAMP_INSET_PT * 2,
      borderWidth: STAMP_BORDER_WIDTH_PT,
      borderColor: rgb(0.1, 0.1, 0.1),
      // no `color` - border only, transparent fill
    });
  }

  if (config.headerText) {
    pdfPage.drawText(config.headerText, {
      x: STAMP_INSET_PT,
      y: pageHeightPt - HEADER_Y_FROM_TOP_PT,
      size: HEADER_FONT_SIZE,
      font,
    });
  }

  if (config.footerText) {
    const text = config.footerText
      .replace('{X}', String(contentPageNumber))
      .replace('{Y}', String(totalContentPages));
    const width = font.widthOfTextAtSize(text, FOOTER_FONT_SIZE);
    pdfPage.drawText(text, {
      x: (pageWidthPt - width) / 2,
      y: FOOTER_Y_PT,
      size: FOOTER_FONT_SIZE,
      font,
    });
  }
}

export async function buildPdfFromPages(
  documentId: string,
  pages: PdfSourcePage[],
  quality: number,
  academicConfig?: AcademicConfig
): Promise<{ uri: string; sizeBytes: number }> {
  const compressQuality = 0.2 + (quality - 1) * 0.2; // quality 1-5 -> 0.2-1.0, same convention as enhanceService/imageExportService

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica); // reused for OCR AND header/footer

  // --- Why inserting a cover page here can NEVER desync any content page's OCR text -----------
  // buildCoverPage() calls pdfDoc.addPage() before the loop below starts, so the cover becomes
  // pdfDoc's page index 0 and every content page shifts one slot later in the final document.
  // This is safe because none of the per-content-page math below is indexed by page position at
  // all:
  //   - pageScale(page.width, page.height) is computed fresh, per iteration, purely from that one
  //     PdfSourcePage's own natural pixel dimensions - it never reads pdfDoc.getPages().length or
  //     any running page counter.
  //   - drawOcrLine(pdfPage, line, scale, pageHeightPt, font) takes the specific PDFPage object for
  //     THIS content page and a pageHeightPt derived from THAT SAME page's own scale computed one
  //     line above it. Its x/y math is entirely local to that one page object and scale value; it
  //     has no concept of "this is document page N" and nothing about an unrelated page prepended
  //     earlier in pdfDoc changes what pdfPage/scale/pageHeightPt evaluate to here.
  // In short: OCR placement is a function of (this content page's own PdfSourcePage, this content
  // page's own freshly-created PDFPage) - never of pdfDoc's page count or ordering. Adding an
  // unrelated page anywhere else in the document is provably a no-op for this math.
  if (academicConfig?.coverPage) {
    await buildCoverPage(pdfDoc, academicConfig.coverPage);
  }

  // Sequential loop on purpose - a Promise.all here would hold every page's raw JPEG bytes in
  // memory at once, defeating the point (same rationale as scannerPipeline.ts's own OCR loop).
  let contentPageNumber = 0;
  const totalContentPages = pages.length;
  for (const page of pages) {
    contentPageNumber += 1;
    const jpgImage = await embedPageImage(pdfDoc, page.uri, compressQuality);

    const scale = pageScale(page.width, page.height);
    const pageWidthPt = page.width * scale;
    const pageHeightPt = page.height * scale;

    const pdfPage = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    pdfPage.drawImage(jpgImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });

    if (page.ocr && page.ocr.blocks.length > 0) {
      drawOcrLayer(pdfPage, page.ocr, scale, pageHeightPt, font);
    }

    // Cover page (if any) is intentionally excluded from this stamping and from the X/Y count -
    // it's not part of `pages`, and this block only ever runs for entries of that array.
    if (academicConfig) {
      stampAcademicPage(pdfPage, pageWidthPt, pageHeightPt, font, academicConfig, contentPageNumber, totalContentPages);
    }
  }

  const pdfBytes = await pdfDoc.save();

  const dir = getDocumentDir(documentId);
  const dest = new File(dir, 'document.pdf');
  if (dest.exists) dest.delete();
  dest.write(pdfBytes);

  return { uri: dest.uri, sizeBytes: dest.size ?? 0 };
}

// Burns a captured signature PNG onto one page of an already-compiled PDF, in place.
// `pageNaturalWidth` must be the natural pixel width of the SOURCE PAGE IMAGE that page was
// built from (LibraryPage.width), not the PDF's own point-space width — it's the anchor used
// to convert `placement` (natural pixel space, top-left origin, same convention as
// SessionPage.cropRect) into PDF points via the page's live getWidth()/getHeight(), so this
// stays correct even if PDF_LONG_SIDE_PT ever changes.
export async function applySignatureToPdf(
  documentId: string,
  pdfUri: string,
  pageIndex: number,
  pageNaturalWidth: number,
  signatureUri: string,
  placement: { originX: number; originY: number; width: number; height: number }
): Promise<{ uri: string; sizeBytes: number }> {
  const existingBytes = await new File(pdfUri).bytes();
  const pdfDoc = await PDFDocument.load(existingBytes);

  const pdfPage = pdfDoc.getPages()[pageIndex];
  if (!pdfPage) throw new Error(`applySignatureToPdf: page ${pageIndex} not found in ${pdfUri}`);

  const signatureFile = new File(signatureUri);
  const sigBytes = await signatureFile.bytes();
  const pngImage = await pdfDoc.embedPng(sigBytes);
  if (signatureFile.exists) signatureFile.delete(); // tmpfile cleanup, mirrors embedPageImage above

  // PDF origin is bottom-left; `placement.originY` is measured from the page image's top edge
  // (same convention as drawOcrLine's flip above), hence the flip.
  const scale = pdfPage.getWidth() / pageNaturalWidth;
  const widthPt = placement.width * scale;
  const heightPt = placement.height * scale;
  const xPt = placement.originX * scale;
  const yPt = pdfPage.getHeight() - placement.originY * scale - heightPt;

  pdfPage.drawImage(pngImage, { x: xPt, y: yPt, width: widthPt, height: heightPt });

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
