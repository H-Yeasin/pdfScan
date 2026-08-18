import 'react-native-get-random-values'; // pdf-lib needs crypto.getRandomValues; also imported at the app entrypoint, but kept here too so this module is safe even if ever imported outside that graph (e.g. a future test file)
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { compressPage } from '../enhance/enhanceService';
import { getDocumentDir } from '../persistence/libraryFiles';
import { fitBox } from '../../utils/fitBox';
import type { LibraryDocument, OcrLine, OcrScript, PageOcr } from '../../types/models';

// Standard-mode pages and the cover page are both fixed at true ISO A4 size, with each image
// uniformly scaled to fit inside CONTENT_MARGIN_PT on every side (never stretched, never
// cropped) - see fitBox. This is what MoreOptionsPanel.tsx's "Page size: A4 · fit to content" /
// "Margin: Small" copy already promises; every page in a document now shares the same physical
// size instead of being shaped around its own source image.
const [A4_WIDTH_PT, A4_HEIGHT_PT] = PageSizes.A4;
const CONTENT_MARGIN_PT = 24; // matches LAYOUT_2IN1_MARGIN_PT's existing convention below

// Long side of a 2-in-1 ("Eco-Save") landscape sheet - that layout is a deliberately separate,
// fixed physical print size (see LAYOUT_2IN1_* below), unrelated to standard/cover pages' own A4
// sizing above.
const PDF_LONG_SIDE_PT = 792;

// Heuristics for turning an OCR line's pixel box into an invisible text run. ML Kit's line
// bounding box doesn't map 1:1 to any single font metric (cap-height vs ascender/descender vs
// line-height all disagree) - these are starting points to be tuned from visual QA, not derived
// constants. They only affect where the invisible, selectable text sits; the visible page is
// unaffected either way.
const FONT_SIZE_TO_BOX_HEIGHT_RATIO = 0.85;
const BASELINE_INSET_RATIO = 0.2;

// --- 2-in-1 ("Eco-Save") layout tuning ---
// A 2-in-1 sheet is a fixed physical page meant to be printed - its whole point is a consistent,
// plannable paper size rather than one shaped around whatever a given pair of scans happens to
// be. This is deliberately kept at US Letter, landscape (792x612, i.e. LAYOUT_2IN1_WIDTH_PT reuses
// PDF_LONG_SIDE_PT), independent of standard/cover pages' own A4 sizing above - it's a distinct,
// opt-in print layout, not part of the "every page is the same size" standard-mode guarantee.
const LAYOUT_2IN1_WIDTH_PT = PDF_LONG_SIDE_PT;
const LAYOUT_2IN1_HEIGHT_PT = 612;
const LAYOUT_2IN1_GUTTER_PT = 15; // dividing gap between the two half-columns
const LAYOUT_2IN1_MARGIN_PT = 24; // outer margin - most printers can't print edge-to-edge anyway

// --- Academic export tuning ---
const STAMP_INSET_PT = 25;
const STAMP_BORDER_WIDTH_PT = 1.5;
const HEADER_Y_FROM_TOP_PT = 40;
const FOOTER_Y_PT = 30;
const HEADER_FONT_SIZE = 9;
const FOOTER_FONT_SIZE = 9;
const COVER_TITLE_FONT_SIZE = 24;
const COVER_SUBTITLE_FONT_SIZE = 14;
const COVER_META_FONT_SIZE = 12;

// Only Devanagari needs a custom embedded font today - Helvetica's WinAnsi encoding has no
// Devanagari glyphs at all, which is why that OCR text silently fails to draw (see the catch in
// drawOcrLine below). Other scripts (chinese/japanese/korean) aren't wired up yet; they still fall
// back to Helvetica same as before, so their OCR text keeps failing to draw exactly like it did
// pre-existing this change - not a regression introduced here, just not yet fixed.
const DEVANAGARI_FONT_MODULE = require('../../../assets/fonts/NotoSansDevanagari-Regular.ttf');

let devanagariFontBytesPromise: Promise<Uint8Array> | null = null;

// Memoized at module scope, not per-build - the raw bytes never change, so the asset resolve+read
// only happens once per app session no matter how many Devanagari PDFs get built afterward.
function loadDevanagariFontBytes(): Promise<Uint8Array> {
  if (!devanagariFontBytesPromise) {
    devanagariFontBytesPromise = (async () => {
      const asset = Asset.fromModule(DEVANAGARI_FONT_MODULE);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('pdfService: Devanagari font asset has no localUri after downloadAsync()');
      return new File(asset.localUri).bytes();
    })();
  }
  return devanagariFontBytesPromise;
}

// registerFontkit is per-PDFDocument (pdf-lib throws FontkitNotRegisteredError on embedFont(bytes)
// without it), so it must run once per build even though the underlying bytes are memoized above.
// subset:true keeps the embedded font limited to glyphs actually drawn before pdfDoc.save() -
// without it, pdf-lib would inline the full ~170KB font into every Devanagari-OCR'd PDF regardless
// of how little text it has.
async function embedDevanagariFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  pdfDoc.registerFontkit(fontkit);
  const bytes = await loadDevanagariFontBytes();
  return pdfDoc.embedFont(bytes, { subset: true });
}

export type PdfSourcePage = {
  uri: string;
  width: number;
  height: number;
  ocr?: PageOcr;
};

// 'standard': one source page per PDF page, sized to that page's own aspect ratio (existing
// behavior). '2_in_1': two source pages side-by-side per landscape sheet - see the
// LAYOUT_2IN1_* constants below for why that's a fixed physical size rather than content-shaped.
export type LayoutMode = 'standard' | '2_in_1';

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

// Where the embedded image was actually drawn on the page, in PDF points - always some margin-
// inset box now (standard/cover pages via CONTENT_MARGIN_PT, 2-in-1 pages via a half-column), never
// the full page. `origin`/`heightPt` are exactly the values the image itself was drawn with (from
// fitBox's `origin`/`height`), so the OCR text lands glued to the image's glyphs no matter where or
// how small it was placed.
type ImagePlacement = { origin: { x: number; y: number }; heightPt: number };

// PDF's origin is bottom-left; OCR `top` is measured from the image's top edge, hence the flip.
// `placement.origin` shifts both axes by the image's actual draw position (0,0 in standard mode),
// and `placement.heightPt` (the DRAWN image height, not the page height) is what the y-flip pivots
// on - this is what makes the same formula correct whether the image fills the whole page or just
// one half-column of a 2-in-1 sheet.
function drawOcrLine(pdfPage: PDFPage, line: OcrLine, scale: number, placement: ImagePlacement, font: PDFFont): void {
  const text = line.text.trim();
  if (!text) return;

  const { left, top, height } = line.bounding;
  const boxHeightPt = height * scale;
  if (!(boxHeightPt > 0)) return;

  const x = placement.origin.x + left * scale;
  const y = placement.origin.y + placement.heightPt - (top + height) * scale + boxHeightPt * BASELINE_INSET_RATIO;
  const size = boxHeightPt * FONT_SIZE_TO_BOX_HEIGHT_RATIO;

  try {
    // opacity: 0 is the mechanism pdf-lib's public API actually exposes for invisible-but-
    // selectable text (there is no direct "Tr 3" render-mode option) - text drawn this way is
    // never rendered but its glyphs and positions remain in the content stream for search/select.
    pdfPage.drawText(text, { x, y, size, font, opacity: 0 });
  } catch (error) {
    // Whichever font is in play (Helvetica/WinAnsi for non-Devanagari scripts, or the embedded
    // Devanagari font otherwise) can still occasionally receive a character outside its supported
    // glyphs. One bad line shouldn't sink the rest of the page's searchable text - same
    // best-effort philosophy as ocrService.ts's own try/catch around OCR itself.
    console.warn('pdfService: skipping unencodable OCR line', error);
  }
}

function drawOcrLayer(pdfPage: PDFPage, ocr: PageOcr, scale: number, placement: ImagePlacement, font: PDFFont): void {
  for (const block of ocr.blocks) {
    for (const line of block.lines) drawOcrLine(pdfPage, line, scale, placement, font);
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

      // Same fixed-A4-box, fit-to-content placement as standard content pages, so a photographed
      // cover sheet shares the exact same page size as the rest of the deck.
      const placement = fitBox(
        image.width,
        image.height,
        CONTENT_MARGIN_PT,
        CONTENT_MARGIN_PT,
        A4_WIDTH_PT - CONTENT_MARGIN_PT * 2,
        A4_HEIGHT_PT - CONTENT_MARGIN_PT * 2
      );

      const page = pdfDoc.addPage(PageSizes.A4);
      page.drawImage(image, {
        x: placement.origin.x,
        y: placement.origin.y,
        width: placement.width,
        height: placement.height,
      });
    } catch (error) {
      // A bad/missing imported cover image must never sink the whole export - same best-effort
      // philosophy as drawOcrLine's catch above. Fall back to no cover page at all.
      console.warn('pdfService: failed to embed imported cover image, skipping cover page', error);
    }
    return;
  }

  // mode === 'template'
  const page = pdfDoc.addPage(PageSizes.A4);
  const titleFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const drawCentered = (text: string, y: number, font: PDFFont, size: number) => {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (A4_WIDTH_PT - width) / 2, y, size, font });
  };

  // Fields are optional and drawn independently, so an all-empty config degrades to a blank A4
  // page rather than an error. Vertical anchors are relative to page height so the layout holds
  // regardless of the exact page size constant in play.
  if (cover.title) drawCentered(cover.title, A4_HEIGHT_PT * 0.4, titleFont, COVER_TITLE_FONT_SIZE);
  if (cover.studentName) {
    drawCentered(cover.studentName, A4_HEIGHT_PT * 0.4 - 40, bodyFont, COVER_SUBTITLE_FONT_SIZE);
  }
  if (cover.courseCode) {
    drawCentered(cover.courseCode, A4_HEIGHT_PT * 0.4 - 64, bodyFont, COVER_META_FONT_SIZE);
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

// Standard layout: one source page per PDF page, every page fixed at A4 size with its image fit
// (uniformly scaled, centered, never stretched/cropped) inside CONTENT_MARGIN_PT - so every page
// in the document shares the same physical size regardless of its source image's own aspect
// ratio. Sequential loop on purpose - a Promise.all here would hold every page's raw JPEG bytes in
// memory at once, defeating the point (same rationale as scannerPipeline.ts's own OCR loop).
async function buildStandardContentPages(
  pdfDoc: PDFDocument,
  pages: PdfSourcePage[],
  compressQuality: number,
  academicConfig: AcademicConfig | undefined,
  stampFont: PDFFont,
  ocrFont: PDFFont
): Promise<void> {
  const boxWidthPt = A4_WIDTH_PT - CONTENT_MARGIN_PT * 2;
  const boxHeightPt = A4_HEIGHT_PT - CONTENT_MARGIN_PT * 2;
  let contentPageNumber = 0;
  const totalContentPages = pages.length;
  for (const page of pages) {
    contentPageNumber += 1;
    const jpgImage = await embedPageImage(pdfDoc, page.uri, compressQuality);

    const placement = fitBox(page.width, page.height, CONTENT_MARGIN_PT, CONTENT_MARGIN_PT, boxWidthPt, boxHeightPt);

    const pdfPage = pdfDoc.addPage(PageSizes.A4);
    pdfPage.drawImage(jpgImage, {
      x: placement.origin.x,
      y: placement.origin.y,
      width: placement.width,
      height: placement.height,
    });

    if (page.ocr && page.ocr.blocks.length > 0) {
      drawOcrLayer(pdfPage, page.ocr, placement.scale, { origin: placement.origin, heightPt: placement.height }, ocrFont);
    }

    // Cover page (if any) is intentionally excluded from this stamping and from the X/Y count -
    // it's not part of `pages`, and this block only ever runs for entries of that array.
    if (academicConfig) {
      stampAcademicPage(pdfPage, A4_WIDTH_PT, A4_HEIGHT_PT, stampFont, academicConfig, contentPageNumber, totalContentPages);
    }
  }
}

// One source page drawn into one half-column of a 2-in-1 sheet, embedding its image and (if
// present) drawing its OCR layer with the exact same scale/origin the image itself was placed
// with - see fitBox and the ImagePlacement comment above drawOcrLine for why that's what keeps the
// invisible searchable text glued to the visible glyphs after the resize+shift.
async function drawTwoUpColumn(
  pdfDoc: PDFDocument,
  pdfPage: PDFPage,
  page: PdfSourcePage,
  compressQuality: number,
  columnX: number,
  ocrFont: PDFFont
): Promise<void> {
  const columnWidthPt = (LAYOUT_2IN1_WIDTH_PT - LAYOUT_2IN1_MARGIN_PT * 2 - LAYOUT_2IN1_GUTTER_PT) / 2;
  const columnHeightPt = LAYOUT_2IN1_HEIGHT_PT - LAYOUT_2IN1_MARGIN_PT * 2;

  const image = await embedPageImage(pdfDoc, page.uri, compressQuality);
  const placement = fitBox(page.width, page.height, columnX, LAYOUT_2IN1_MARGIN_PT, columnWidthPt, columnHeightPt);

  pdfPage.drawImage(image, {
    x: placement.origin.x,
    y: placement.origin.y,
    width: placement.width,
    height: placement.height,
  });

  if (page.ocr && page.ocr.blocks.length > 0) {
    drawOcrLayer(pdfPage, page.ocr, placement.scale, { origin: placement.origin, heightPt: placement.height }, ocrFont);
  }
}

// 2-in-1 ("Eco-Save") layout: two source pages per landscape sheet, side-by-side. Sheets are
// numbered/counted independently of buildStandardContentPages' per-source-page counter - a "Page X
// of Y" footer here should count printed SHEETS, not original scans, since that's what the reader
// is actually holding. An odd final page gets the left column only; the right column is left
// blank rather than stretched across the sheet, so no image is ever drawn distorted.
async function buildTwoUpContentPages(
  pdfDoc: PDFDocument,
  pages: PdfSourcePage[],
  compressQuality: number,
  academicConfig: AcademicConfig | undefined,
  stampFont: PDFFont,
  ocrFont: PDFFont
): Promise<void> {
  const columnWidthPt = (LAYOUT_2IN1_WIDTH_PT - LAYOUT_2IN1_MARGIN_PT * 2 - LAYOUT_2IN1_GUTTER_PT) / 2;
  const leftColumnX = LAYOUT_2IN1_MARGIN_PT;
  const rightColumnX = LAYOUT_2IN1_MARGIN_PT + columnWidthPt + LAYOUT_2IN1_GUTTER_PT;

  const totalSheets = Math.ceil(pages.length / 2);
  let sheetNumber = 0;

  for (let i = 0; i < pages.length; i += 2) {
    sheetNumber += 1;
    const pdfPage = pdfDoc.addPage([LAYOUT_2IN1_WIDTH_PT, LAYOUT_2IN1_HEIGHT_PT]);

    await drawTwoUpColumn(pdfDoc, pdfPage, pages[i], compressQuality, leftColumnX, ocrFont);

    const pageB = pages[i + 1];
    if (pageB) {
      await drawTwoUpColumn(pdfDoc, pdfPage, pageB, compressQuality, rightColumnX, ocrFont);
    }

    if (academicConfig) {
      stampAcademicPage(pdfPage, LAYOUT_2IN1_WIDTH_PT, LAYOUT_2IN1_HEIGHT_PT, stampFont, academicConfig, sheetNumber, totalSheets);
    }
  }
}

export async function buildPdfFromPages(
  documentId: string,
  pages: PdfSourcePage[],
  quality: number,
  academicConfig?: AcademicConfig,
  ocrScript?: OcrScript,
  courseFolder?: string,
  layoutMode: LayoutMode = 'standard'
): Promise<{ uri: string; sizeBytes: number }> {
  const compressQuality = 0.2 + (quality - 1) * 0.2; // quality 1-5 -> 0.2-1.0, same convention as enhanceService/imageExportService

  const pdfDoc = await PDFDocument.create();
  // stampFont is for header/footer only and always stays on the asset-free standard font, per
  // scope ("Keep Western languages running on the asset-free standard fonts"). ocrFont is the one
  // that may swap to the embedded Devanagari font - drawOcrLine's x/y/size math (above) is derived
  // purely from the OCR bounding box + page scale, never from font metrics, so this swap changes
  // only which glyphs get embedded/rendered, never where the (invisible) text sits on the page.
  const stampFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const ocrFont = ocrScript === 'devanagari' ? await embedDevanagariFont(pdfDoc) : stampFont;

  // --- Why inserting a cover page here can NEVER desync any content page's OCR text -----------
  // buildCoverPage() calls pdfDoc.addPage() before the loop below starts, so the cover becomes
  // pdfDoc's page index 0 and every content page shifts one slot later in the final document.
  // This is safe because none of the per-content-page math below (in either
  // buildStandardContentPages or buildTwoUpContentPages) is indexed by page position at all:
  //   - fitBox is computed fresh, per iteration, purely from that one (or two) PdfSourcePage's own
  //     natural pixel dimensions and the fixed A4/column box - never from pdfDoc.getPages().length
  //     or any running page counter.
  //   - drawOcrLine takes the specific PDFPage object for THIS sheet and a placement derived from
  //     THAT SAME page's own scale computed one line above it. Its x/y math is entirely local to
  //     that one page object and scale value; it has no concept of "this is document page N" and
  //     nothing about an unrelated page prepended earlier in pdfDoc changes what pdfPage/scale/
  //     placement evaluate to here.
  // In short: OCR placement is a function of (this content page's own PdfSourcePage, this content
  // page's own freshly-created PDFPage) - never of pdfDoc's page count or ordering. Adding an
  // unrelated page anywhere else in the document is provably a no-op for this math.
  if (academicConfig?.coverPage) {
    await buildCoverPage(pdfDoc, academicConfig.coverPage);
  }

  if (layoutMode === '2_in_1') {
    await buildTwoUpContentPages(pdfDoc, pages, compressQuality, academicConfig, stampFont, ocrFont);
  } else {
    await buildStandardContentPages(pdfDoc, pages, compressQuality, academicConfig, stampFont, ocrFont);
  }

  const pdfBytes = await pdfDoc.save();

  const dir = getDocumentDir(documentId, courseFolder);
  const dest = new File(dir, 'document.pdf');
  if (dest.exists) dest.delete();
  dest.write(pdfBytes);

  return { uri: dest.uri, sizeBytes: dest.size ?? 0 };
}

// Burns a captured signature PNG onto one page of an already-compiled PDF, in place.
// `pageNaturalWidth`/`pageNaturalHeight` must be the natural pixel dimensions of the SOURCE PAGE
// IMAGE that page was built from (LibraryPage.width/height), not the PDF's own point-space size —
// they're the anchor used to convert `placement` (natural pixel space, top-left origin, same
// convention as SessionPage.cropRect) into PDF points.
// `fitToMarginBox` must be true for any page whose image was placed via fitBox inside
// CONTENT_MARGIN_PT (every standard content page, and an 'imported_image' cover), and false only
// for a 'template' cover page (text-only, no placed image, still sized full-page-proportional) —
// see applySignatureToDocument in libraryOperations.ts for how callers determine which.
export async function applySignatureToPdf(
  documentId: string,
  pdfUri: string,
  pageIndex: number,
  pageNaturalWidth: number,
  pageNaturalHeight: number,
  fitToMarginBox: boolean,
  signatureUri: string,
  placement: { originX: number; originY: number; width: number; height: number },
  courseFolder?: string
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
  let xPt: number;
  let yPt: number;
  let widthPt: number;
  let heightPt: number;
  if (fitToMarginBox) {
    // Reproduces the exact same fitBox placement the image itself was drawn with at build time
    // (purely a function of the page's own natural dimensions + the fixed A4/margin box, so it's
    // safe to recompute here rather than needing to store it), then maps `placement` through that
    // box the same way drawOcrLine maps an OCR line's box - generalized here from a text line to
    // an arbitrary signature rect.
    const box = fitBox(
      pageNaturalWidth,
      pageNaturalHeight,
      CONTENT_MARGIN_PT,
      CONTENT_MARGIN_PT,
      A4_WIDTH_PT - CONTENT_MARGIN_PT * 2,
      A4_HEIGHT_PT - CONTENT_MARGIN_PT * 2
    );
    widthPt = placement.width * box.scale;
    heightPt = placement.height * box.scale;
    xPt = box.origin.x + placement.originX * box.scale;
    yPt = box.origin.y + box.height - (placement.originY + placement.height) * box.scale;
  } else {
    const scale = pdfPage.getWidth() / pageNaturalWidth;
    widthPt = placement.width * scale;
    heightPt = placement.height * scale;
    xPt = placement.originX * scale;
    yPt = pdfPage.getHeight() - placement.originY * scale - heightPt;
  }

  pdfPage.drawImage(pngImage, { x: xPt, y: yPt, width: widthPt, height: heightPt });

  const pdfBytes = await pdfDoc.save();

  const dir = getDocumentDir(documentId, courseFolder);
  const dest = new File(dir, 'document.pdf');
  if (dest.exists) dest.delete();
  dest.write(pdfBytes);

  return { uri: dest.uri, sizeBytes: dest.size ?? 0 };
}

// Backfills a `document.pdf` for a library doc saved before every doc always got one (pre-unified
// reader). Every OTHER path that produces a LibraryDocument (DeliverScreen, mergeDocuments,
// splitDocument, compressDocument, applySignedPage) already always sets pdfUri now, so this only
// ever fires for a genuinely pre-existing AsyncStorage record — a no-op for anything saved after
// that change shipped.
export async function ensureDocumentPdf(doc: LibraryDocument, ocrScript: OcrScript): Promise<LibraryDocument> {
  if (doc.pdfUri) return doc;
  const result = await buildPdfFromPages(
    doc.id,
    doc.pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr })),
    5,
    undefined,
    ocrScript,
    doc.courseFolder
  );
  return { ...doc, pdfUri: result.uri, sizeBytes: doc.format === 'PDF' ? result.sizeBytes : doc.sizeBytes };
}

export function estimateSizeBytes(pages: PdfSourcePage[], quality: number): number {
  const rawBytes = pages.reduce((sum, page) => sum + (new File(page.uri).size ?? 0), 0);
  const qualityMultiplier = 0.2 + (quality - 1) * 0.2; // quality 1-5 -> 0.2-1.0
  return Math.round(rawBytes * qualityMultiplier);
}
