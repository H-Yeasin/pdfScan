import 'react-native-get-random-values'; // pdf-lib needs crypto.getRandomValues; also imported at the app entrypoint, but kept here too so this module is safe even if ever imported outside that graph (e.g. a future test file)
import { File } from 'expo-file-system';
import { PDFDocument, PageSizes, rgb, type PDFFont, type PDFPage, type PDFRef } from 'pdf-lib';
import { renderPage } from '../enhance/skiaEnhance';
import { estimateExportBytes, exportPreset, isMasterQuality, type ExportPreset } from '../capture/imageSpec';
import { getDocumentDir } from '../persistence/libraryFiles';
import { fitBox, type BoxFit } from '../../utils/fitBox';
import type { LibraryDocument, PageLayout, PageOcr } from '../../types/models';
import { drawOcrTextLayer, embedGlyphlessFont } from './textLayer';
import { layoutCover, type CoverItem, type CoverPageConfig } from './coverTemplates';
import { createTextDrawer, type TextDrawer } from './visibleText';
import type { PageSizeId } from './pageSize';

export type { CoverPageConfig } from './coverTemplates';

// Every page of a document is one paper size, A4 or US Letter (§4 S5), with each image uniformly
// scaled to fit inside CONTENT_MARGIN_PT on every side (never stretched, never cropped) - see
// fitBox. The 2-in-1 layout uses the same paper turned landscape. Default A4; Deliver picks
// Letter for US/Canada (defaultPageSize).
export type { PageSizeId } from './pageSize';
export type PageDims = { width: number; height: number };

// Portrait size in points.
export function pageDimensions(size: PageSizeId): PageDims {
  const [width, height] = size === 'Letter' ? PageSizes.Letter : PageSizes.A4;
  return { width, height };
}

const A4 = pageDimensions('A4');
const CONTENT_MARGIN_PT = 24; // matches LAYOUT_2IN1_MARGIN_PT's existing convention below

// --- 2-in-1 ("Eco-Save") layout tuning ---
// A 2-in-1 sheet is the chosen paper size in landscape: two source pages side by side.
const LAYOUT_2IN1_GUTTER_PT = 15; // dividing gap between the two half-columns
const LAYOUT_2IN1_MARGIN_PT = 24; // outer margin - most printers can't print edge-to-edge anyway

// A built PDF's page count and paper (from its last page, in either orientation), for the §5 T1
// backfill. null when it can't be read.
export async function inspectPdf(pdfUri: string | undefined): Promise<{ pageCount: number; pageSize: PageSizeId; landscape: boolean } | null> {
  if (!pdfUri) return null;
  try {
    const file = new File(pdfUri);
    if (!file.exists) return null;
    const pdfDoc = await PDFDocument.load(await file.bytes(), { updateMetadata: false });
    const pages = pdfDoc.getPages();
    const last = pages[pages.length - 1];
    if (!last) return null;
    const shortSide = Math.min(last.getWidth(), last.getHeight());
    return {
      pageCount: pages.length,
      pageSize: Math.abs(shortSide - PageSizes.Letter[0]) < 1 ? 'Letter' : 'A4',
      landscape: last.getWidth() > last.getHeight(),
    };
  } catch {
    return null;
  }
}

// The paper size a built PDF uses, read from its last page (never the cover, which is first), in
// either orientation, so a library rebuild (merge, split, compress, sign) keeps it. Anything that
// isn't Letter, or can't be read, is A4.
export async function pageSizeOfPdf(pdfUri: string | undefined): Promise<PageSizeId> {
  return (await inspectPdf(pdfUri))?.pageSize ?? 'A4';
}

// --- Academic export tuning ---
const STAMP_INSET_PT = 25;
const STAMP_BORDER_WIDTH_PT = 1.5;
const HEADER_Y_FROM_TOP_PT = 40;
const FOOTER_Y_PT = 30;
const HEADER_FONT_SIZE = 9;
const FOOTER_FONT_SIZE = 9;

export type PdfSourcePage = {
  uri: string;
  width: number;
  height: number;
  ocr?: PageOcr;
  layout?: PageLayout;
};

// The box a standard-layout page image is fit into: the margin box, or for a 'fullPage' image (an
// A4 canvas at a fixed dpi, e.g. an ID card page) an A4-sized box centred on the sheet, so it
// prints at true size on any paper: it fills A4 exactly, and on Letter loses about 9 mm at the
// top and bottom edges (where the ID layout has nothing) and gains 3 mm of white at the sides.
function contentBox(layout: PageLayout | undefined, page: PageDims): { x: number; y: number; width: number; height: number } {
  if (layout === 'fullPage') return { x: (page.width - A4.width) / 2, y: (page.height - A4.height) / 2, width: A4.width, height: A4.height };
  return marginBox(page);
}

// Where one library page's image goes on a PDF page, in points (bottom-left origin): the whole
// page ('full', standard layout) or one column of a 2-in-1 sheet. `pageDims` is the portrait
// paper; a 2-in-1 sheet is that paper turned landscape. The builder draws with this and
// documents/pageMap.ts maps OCR boxes with it, so the two can't drift apart.
export type PageSlot = 'full' | 'left' | 'right';
export function imagePlacement(width: number, height: number, slot: PageSlot, pageDims: PageDims, layout?: PageLayout): BoxFit {
  if (slot === 'full') {
    const box = contentBox(layout, pageDims);
    return fitBox(width, height, box.x, box.y, box.width, box.height);
  }
  const sheet = { width: pageDims.height, height: pageDims.width };
  const columnWidthPt = (sheet.width - LAYOUT_2IN1_MARGIN_PT * 2 - LAYOUT_2IN1_GUTTER_PT) / 2;
  const columnHeightPt = sheet.height - LAYOUT_2IN1_MARGIN_PT * 2;
  const columnX = slot === 'left' ? LAYOUT_2IN1_MARGIN_PT : LAYOUT_2IN1_MARGIN_PT + columnWidthPt + LAYOUT_2IN1_GUTTER_PT;
  return fitBox(width, height, columnX, LAYOUT_2IN1_MARGIN_PT, columnWidthPt, columnHeightPt);
}

function marginBox(page: PageDims) {
  return {
    x: CONTENT_MARGIN_PT,
    y: CONTENT_MARGIN_PT,
    width: page.width - CONTENT_MARGIN_PT * 2,
    height: page.height - CONTENT_MARGIN_PT * 2,
  };
}

// 'standard': one source page per PDF page, sized to that page's own aspect ratio (existing
// behavior). '2_in_1': two source pages side-by-side per landscape sheet - see the
// LAYOUT_2IN1_* constants below for why that's a fixed physical size rather than content-shaped.
export type LayoutMode = 'standard' | '2_in_1';

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

// How page images get into the PDF. 'as-is' embeds the file's bytes untouched - for pages that
// are already final (library masters at quality 5, or pages Deliver rendered at the export preset).
// An ExportPreset renders each page from its master once, at that preset, then embeds the result.
export type PageImageEncoding = 'as-is' | ExportPreset;

// Exporting at master quality needs no re-encode at all, so it's the same as 'as-is'.
export function encodingForQuality(quality: number): PageImageEncoding {
  return isMasterQuality(quality) ? 'as-is' : exportPreset(quality);
}

// Embeds one page image. Never decodes/re-encodes an 'as-is' page; an ExportPreset page is
// rendered exactly once and the transient file deleted right after - no page holds more than one
// raw image buffer at a time before pdf-lib takes ownership of the bytes.
async function embedPageImage(pdfDoc: PDFDocument, uri: string, encoding: PageImageEncoding) {
  let sourceUri = uri;
  let tempUri: string | null = null;
  if (encoding !== 'as-is') {
    tempUri = (await renderPage(uri, {}, encoding)).uri;
    sourceUri = tempUri;
  }
  try {
    const bytes = await new File(sourceUri).bytes();
    return sniffImageKind(bytes) === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  } finally {
    if (tempUri) {
      const tempFile = new File(tempUri);
      if (tempFile.exists) tempFile.delete();
    }
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

// What a standard font (WinAnsi encoding) would draw for `text`: anything it can't encode, which
// would throw, becomes '?'. Visible text no longer goes through this - since §6 L3 it is drawn by
// visibleText.ts in any script - but isWinAnsiSafe (winAnsi.ts) is tested against it, and
// visibleText's last-resort fallback does the same.
const winAnsiSets = new WeakMap<PDFFont, Set<number>>();
export function toWinAnsiSafe(text: string, font: PDFFont): string {
  let supported = winAnsiSets.get(font);
  if (!supported) {
    supported = new Set(font.getCharacterSet());
    winAnsiSets.set(font, supported);
  }
  let out = '';
  for (const ch of text) out += supported.has(ch.codePointAt(0) ?? 0) ? ch : '?';
  return out;
}

// Builds the academic cover page and appends it to `pdfDoc` via addPage(), so it becomes page
// index 0. Must be called BEFORE the per-content-page loop in buildPdfFromPages runs - see the
// invariant comment above that loop for why prepending a page here is guaranteed not to affect
// any content page's OCR text coordinates.
async function buildCoverPage(pdfDoc: PDFDocument, cover: CoverPageConfig, pageDims: PageDims, text: TextDrawer): Promise<void> {
  if (cover.mode === 'imported_image') {
    if (!cover.importedUri) {
      console.warn('pdfService: cover mode "imported_image" with no importedUri, skipping cover page');
      return;
    }
    try {
      const bytes = await new File(cover.importedUri).bytes();
      const kind = sniffImageKind(bytes);
      const image = kind === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

      // Same margin box, fit-to-content placement as standard content pages, so a photographed
      // cover sheet shares the exact same page size as the rest of the deck.
      const box = marginBox(pageDims);
      const placement = fitBox(image.width, image.height, box.x, box.y, box.width, box.height);

      const page = pdfDoc.addPage([pageDims.width, pageDims.height]);
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

  // mode === 'template': coverTemplates.layoutCover places everything; this only draws it.
  const page = pdfDoc.addPage([pageDims.width, pageDims.height]);
  await drawCoverItems(page, layoutCover(cover.templateId, cover.values, pageDims), text);
}

// layoutCover's items are top-down; pdf-lib's y axis points up. Text in any script (§6 L3).
async function drawCoverItems(page: PDFPage, items: CoverItem[], text: TextDrawer): Promise<void> {
  const pageHeight = page.getHeight();
  const ink = rgb(0.1, 0.1, 0.1);
  for (const item of items) {
    if (item.kind === 'text') {
      await text.draw(page, item.text, { x: item.x, y: pageHeight - item.y, size: item.size, bold: item.bold, align: item.align });
    } else if (item.kind === 'line') {
      page.drawLine({
        start: { x: item.x1, y: pageHeight - item.y1 },
        end: { x: item.x2, y: pageHeight - item.y2 },
        thickness: item.width,
        color: ink,
      });
    } else {
      page.drawRectangle({
        x: item.x,
        y: pageHeight - item.y - item.height,
        width: item.width,
        height: item.height,
        borderWidth: item.borderWidth,
        borderColor: ink,
      });
    }
  }
}

// `{X}` and `{Y}` (every occurrence) become this page's number and the page count. Other tokens
// ({name}, {roll}, ...) were filled in before the build (submit/naming.renderText).
export function fillPageNumbers(text: string, pageNumber: number, totalPages: number): string {
  return text.split('{X}').join(String(pageNumber)).split('{Y}').join(String(totalPages));
}

// Draws the optional border/header/footer onto one CONTENT page (never the cover page - the
// cover is built separately by buildCoverPage and excluded from this stamping and from the
// "Page X of Y" count entirely). Takes this call's own pageWidthPt/pageHeightPt rather than a
// fixed size, matching the existing per-page-variable-size architecture. Header and footer text
// can be in any script (§6 L3, visibleText.ts).
async function stampAcademicPage(
  pdfPage: PDFPage,
  pageWidthPt: number,
  pageHeightPt: number,
  text: TextDrawer,
  config: AcademicConfig,
  contentPageNumber: number,
  totalContentPages: number
): Promise<void> {
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
    await text.draw(pdfPage, fillPageNumbers(config.headerText, contentPageNumber, totalContentPages), {
      x: STAMP_INSET_PT,
      y: pageHeightPt - HEADER_Y_FROM_TOP_PT,
      size: HEADER_FONT_SIZE,
    });
  }

  if (config.footerText) {
    await text.draw(pdfPage, fillPageNumbers(config.footerText, contentPageNumber, totalContentPages), {
      x: pageWidthPt / 2,
      y: FOOTER_Y_PT,
      size: FOOTER_FONT_SIZE,
      align: 'center',
    });
  }
}

// Standard layout: one source page per PDF page, every page the chosen paper size with its image fit
// (uniformly scaled, centered, never stretched/cropped) inside CONTENT_MARGIN_PT - so every page
// in the document shares the same physical size regardless of its source image's own aspect
// ratio. Sequential loop on purpose - a Promise.all here would hold every page's raw JPEG bytes in
// memory at once, defeating the point (same rationale as scannerPipeline.ts's own OCR loop).
async function buildStandardContentPages(
  pdfDoc: PDFDocument,
  pages: PdfSourcePage[],
  encoding: PageImageEncoding,
  academicConfig: AcademicConfig | undefined,
  text: TextDrawer,
  ocrFont: PDFRef,
  pageDims: PageDims,
  onPage?: (done: number, total: number) => void
): Promise<void> {
  let contentPageNumber = 0;
  const totalContentPages = pages.length;
  for (const page of pages) {
    contentPageNumber += 1;
    const jpgImage = await embedPageImage(pdfDoc, page.uri, encoding);

    const placement = imagePlacement(page.width, page.height, 'full', pageDims, page.layout);

    const pdfPage = pdfDoc.addPage([pageDims.width, pageDims.height]);
    pdfPage.drawImage(jpgImage, {
      x: placement.origin.x,
      y: placement.origin.y,
      width: placement.width,
      height: placement.height,
    });

    if (page.ocr && page.ocr.blocks.length > 0) {
      drawOcrTextLayer(pdfPage, ocrFont, page.ocr, { origin: placement.origin, heightPt: placement.height, scale: placement.scale });
    }

    // Cover page (if any) is intentionally excluded from this stamping and from the X/Y count -
    // it's not part of `pages`, and this block only ever runs for entries of that array.
    if (academicConfig) {
      await stampAcademicPage(pdfPage, pageDims.width, pageDims.height, text, academicConfig, contentPageNumber, totalContentPages);
    }
    onPage?.(contentPageNumber, totalContentPages);
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
  encoding: PageImageEncoding,
  slot: 'left' | 'right',
  ocrFont: PDFRef,
  pageDims: PageDims
): Promise<void> {
  const image = await embedPageImage(pdfDoc, page.uri, encoding);
  const placement = imagePlacement(page.width, page.height, slot, pageDims);

  pdfPage.drawImage(image, {
    x: placement.origin.x,
    y: placement.origin.y,
    width: placement.width,
    height: placement.height,
  });

  if (page.ocr && page.ocr.blocks.length > 0) {
    drawOcrTextLayer(pdfPage, ocrFont, page.ocr, { origin: placement.origin, heightPt: placement.height, scale: placement.scale });
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
  encoding: PageImageEncoding,
  academicConfig: AcademicConfig | undefined,
  text: TextDrawer,
  ocrFont: PDFRef,
  pageDims: PageDims,
  onPage?: (done: number, total: number) => void
): Promise<void> {
  // The chosen paper turned landscape.
  const sheet = { width: pageDims.height, height: pageDims.width };

  const totalSheets = Math.ceil(pages.length / 2);
  let sheetNumber = 0;

  for (let i = 0; i < pages.length; i += 2) {
    sheetNumber += 1;
    const pdfPage = pdfDoc.addPage([sheet.width, sheet.height]);

    await drawTwoUpColumn(pdfDoc, pdfPage, pages[i], encoding, 'left', ocrFont, pageDims);

    const pageB = pages[i + 1];
    if (pageB) {
      await drawTwoUpColumn(pdfDoc, pdfPage, pageB, encoding, 'right', ocrFont, pageDims);
    }
    onPage?.(Math.min(i + 2, pages.length), pages.length);

    if (academicConfig) {
      await stampAcademicPage(pdfPage, sheet.width, sheet.height, text, academicConfig, sheetNumber, totalSheets);
    }
  }
}

export type BuildPdfOptions = {
  // Where to write the PDF. Default: the document's own library/<id>/document.pdf. A §4
  // submission goes to library/<id>/submissions/<name>.pdf instead.
  dest?: File;
  // Called after each source page is drawn (1-based), for progress text.
  onPage?: (done: number, total: number) => void;
  // Last changes before the file is written, e.g. annotations/pdfAnnotations.writeAnnotations
  // (§5 T4). A hook rather than an import, so this module doesn't depend on the page map.
  beforeSave?: (pdfDoc: PDFDocument) => void;
};

export async function buildPdfFromPages(
  documentId: string,
  pages: PdfSourcePage[],
  encoding: PageImageEncoding,
  academicConfig?: AcademicConfig,
  layoutMode: LayoutMode = 'standard',
  pageSize: PageSizeId = 'A4',
  options: BuildPdfOptions = {}
): Promise<{ uri: string; sizeBytes: number }> {
  const pageDims = pageDimensions(pageSize);

  const pdfDoc = await PDFDocument.create();
  // ocrFont is the glyphless font carrying the invisible OCR text in any script (textLayer.ts);
  // `text` draws the visible header/footer/cover text in any script (visibleText.ts), sharing it.
  const ocrFont = await embedGlyphlessFont(pdfDoc);
  const text = createTextDrawer(pdfDoc, ocrFont);

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
    await buildCoverPage(pdfDoc, academicConfig.coverPage, pageDims, text);
  }

  if (layoutMode === '2_in_1') {
    await buildTwoUpContentPages(pdfDoc, pages, encoding, academicConfig, text, ocrFont, pageDims, options.onPage);
  } else {
    await buildStandardContentPages(pdfDoc, pages, encoding, academicConfig, text, ocrFont, pageDims, options.onPage);
  }

  options.beforeSave?.(pdfDoc);
  const pdfBytes = await pdfDoc.save();

  const dest = options.dest ?? new File(getDocumentDir(documentId), 'document.pdf');
  if (dest.exists) dest.delete();
  dest.write(pdfBytes);

  return { uri: dest.uri, sizeBytes: dest.size ?? 0 };
}

// §7 R2: the preset's cover, border, header and footer on a PDF that wasn't built from page
// images (an imported PDF, or one rasterized from it): every existing page is a content page and
// is stamped at its own size; the cover, on the preset's paper, goes in front. `glyphlessFont`
// is reused if the caller already embedded it (a rasterized build's text layer).
export async function decoratePdf(
  pdfDoc: PDFDocument,
  config: AcademicConfig,
  pageSize: PageSizeId = 'A4',
  glyphlessFont?: PDFRef
): Promise<void> {
  const text = createTextDrawer(pdfDoc, glyphlessFont ?? (await embedGlyphlessFont(pdfDoc)));
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    await stampAcademicPage(pages[i], pages[i].getWidth(), pages[i].getHeight(), text, config, i + 1, pages.length);
  }
  if (config.coverPage) {
    const before = pdfDoc.getPageCount();
    await buildCoverPage(pdfDoc, config.coverPage, pageDimensions(pageSize), text);
    // buildCoverPage appends (and skips a cover it can't draw); move it to the front.
    if (pdfDoc.getPageCount() > before) {
      const cover = pdfDoc.getPage(before);
      pdfDoc.removePage(before);
      pdfDoc.insertPage(0, cover);
    }
  }
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
  let xPt: number;
  let yPt: number;
  let widthPt: number;
  let heightPt: number;
  if (fitToMarginBox) {
    // Reproduces the exact same fitBox placement the image itself was drawn with at build time
    // (purely a function of the page's own natural dimensions + this page's margin box - its real
    // size, A4 or Letter, read back from the PDF - so it's safe to recompute here rather than
    // needing to store it), then maps `placement` through that box the same way drawOcrLine maps
    // an OCR line's box - generalized here from a text line to an arbitrary signature rect.
    const margin = marginBox({ width: pdfPage.getWidth(), height: pdfPage.getHeight() });
    const box = fitBox(pageNaturalWidth, pageNaturalHeight, margin.x, margin.y, margin.width, margin.height);
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

  const dir = getDocumentDir(documentId);
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
export async function ensureDocumentPdf(doc: LibraryDocument): Promise<LibraryDocument> {
  if (doc.pdfUri) return doc;
  const result = await buildPdfFromPages(
    doc.id,
    doc.pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout })),
    'as-is'
  );
  return { ...doc, pdfUri: result.uri, sizeBytes: doc.format === 'PDF' ? result.sizeBytes : doc.sizeBytes, pdfLayout: 'standard', pdfPageSize: 'A4' };
}

// Deliver's "≈ size" hint. Session pages are master-spec files, so their size scaled by the
// preset's size factor is a fair guess at the exported page images (which dominate a scan PDF).
export function estimateSizeBytes(pages: PdfSourcePage[], quality: number): number {
  const masterBytes = pages.reduce((sum, page) => sum + (new File(page.uri).size ?? 0), 0);
  return estimateExportBytes(masterBytes, quality);
}
