import { File, Paths } from 'expo-file-system';
import { ImageFormat, PaintStyle, Skia } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';
import { fitBox } from '../../utils/fitBox';
import { layoutCover, type CoverItem, type CoverPageConfig } from './coverTemplates';
import { fillPageNumbers, pageDimensions, type AcademicConfig, type PageSizeId } from './pdfService';
import { drawShaped } from './skiaText';

// These cover/border/header-footer visuals are what the Reader shows for a scan: the page
// surface draws each page's display copy (surfacePages.scanPage), so the app matches the export.
// They are also load-bearing for two other things that consume LibraryPage.fileUri directly:
// FileRow's library-list thumbnail (doc.pages[0].fileUri), and the JPG-format Sign flow (which
// edits doc.pages[i].fileUri in place). This module never touches the images fed into
// buildPdfFromPages, which keeps drawing its own crisp vector version for the actual PDF.

// Ratios of the long side, derived directly from pdfService.ts's own border/header/footer point
// constants (divided by 792, content pages' pre-A4 long side), so this raster rendering stays
// visually proportioned like the PDF's vector version despite being produced by an entirely
// different engine (Skia here, pdf-lib there). These stamp a COPY of the page's own source image
// at its own native size (see stampContentPageImage below), so they're unaffected by the cover
// canvas size change just below.
const STAMP_INSET_RATIO = 25 / 792;
const STAMP_BORDER_WIDTH_RATIO = 1.5 / 792;
const HEADER_Y_RATIO = 40 / 792; // distance from the TOP edge (raster is top-down; pdf-lib is bottom-up)
const FOOTER_Y_RATIO = 30 / 792; // distance from the BOTTOM edge
const STAMP_FONT_SIZE_RATIO = 9 / 792;
const STAMP_TEXT_COLOR = '#1a1a1a';

// The cover is laid out on the document's paper size (in points) and drawn here on a canvas of
// the same shape, 1200 px on the long side, like a normal scanned page's display copy.
const COVER_RASTER_HEIGHT_PX = 1200;

// Text is drawn with skiaText.drawShaped: the same Skia Paragraph (system fonts, any script) the
// PDF uses for text Helvetica can't draw (§6 L3), so the display copy and the PDF agree.

async function writeJpeg(surface: NonNullable<ReturnType<typeof Skia.Surface.MakeOffscreen>>, prefix: string) {
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 92);
  const dest = new File(Paths.cache, `${createId(prefix)}.jpg`);
  dest.write(bytes);
  return dest.uri;
}

// Renders the academic cover page as a standalone image so it can be prepended to a
// LibraryDocument's own `pages` array like any other page. Returns null (never throws) on any
// failure - a bad/missing cover image must not block the rest of the save.
export async function renderCoverPageImage(
  cover: CoverPageConfig,
  pageSize: PageSizeId = 'A4'
): Promise<{ uri: string; width: number; height: number } | null> {
  if (cover.mode === 'imported_image') {
    if (!cover.importedUri) return null;
    try {
      const data = await Skia.Data.fromURI(cover.importedUri);
      const image = Skia.Image.MakeImageFromEncoded(data);
      if (!image) return null;
      return { uri: cover.importedUri, width: image.width(), height: image.height() };
    } catch (error) {
      console.warn('academicRasterService: failed to read imported cover image', error);
      return null;
    }
  }

  // mode === 'template'
  try {
    return await renderLayoutImage(layoutCover(cover.templateId, cover.values, pageDimensions(pageSize)), pageSize, 'cover');
  } catch (error) {
    console.warn('academicRasterService: failed to render template cover page', error);
    return null;
  }
}

// Draws laid-out page items (coverTemplates: a cover, or §5 T6's exam-pack contents page) on a
// white page-shaped canvas, COVER_RASTER_HEIGHT_PX tall, and writes it as a JPEG in the cache:
// the same items pdfService draws, scaled from points to pixels. Text is shaped with the system
// fonts (skiaText.ts), centred with its own metrics; line breaks come from the layout.
export async function renderLayoutImage(
  items: readonly CoverItem[],
  pageSize: PageSizeId,
  prefix: string
): Promise<{ uri: string; width: number; height: number }> {
  const pagePt = pageDimensions(pageSize);
  const height = COVER_RASTER_HEIGHT_PX;
  const width = Math.round((height * pagePt.width) / pagePt.height);
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('Skia failed to create an offscreen surface for a laid-out page');
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color('#ffffff'));

  const scale = width / pagePt.width;
  const strokePaint = Skia.Paint();
  strokePaint.setStyle(PaintStyle.Stroke);
  strokePaint.setColor(Skia.Color(STAMP_TEXT_COLOR));
  strokePaint.setAntiAlias(true);

  for (const item of items) {
    if (item.kind === 'text') {
      drawShaped(canvas, item.text, item.x * scale, item.y * scale, item.size * scale, item.bold, item.align, STAMP_TEXT_COLOR);
    } else if (item.kind === 'image') {
      // §10 M4: the University cover's logo, fitted like the PDF does; skipped if unreadable.
      try {
        const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(item.uri));
        if (image) {
          const fit = fitBox(image.width(), image.height(), item.x * scale, item.y * scale, item.width * scale, item.height * scale);
          canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(fit.origin.x, fit.origin.y, fit.width, fit.height), Skia.Paint());
        }
      } catch (error) {
        console.warn('academicRasterService: could not draw the cover logo', error);
      }
    } else if (item.kind === 'line') {
      strokePaint.setStrokeWidth(item.width * scale);
      canvas.drawLine(item.x1 * scale, item.y1 * scale, item.x2 * scale, item.y2 * scale, strokePaint);
    } else {
      strokePaint.setStrokeWidth(item.borderWidth * scale);
      canvas.drawRect(Skia.XYWHRect(item.x * scale, item.y * scale, item.width * scale, item.height * scale), strokePaint);
    }
  }

  const uri = await writeJpeg(surface, prefix);
  return { uri, width, height };
}

export function hasContentPageStamp(config: AcademicConfig | null | undefined): config is AcademicConfig {
  return !!config && (config.enableBorder || !!config.headerText || !!config.footerText);
}

// Draws the border/header/footer over a content page of width x height pixels already drawn on
// `canvas`. Shared by the saved copy below and the Review screen's live SkPicture preview, so the
// two can't drift. Every size is a ratio of the long side, so it renders the same at any resolution.
export function drawAcademicStamp(
  canvas: SkCanvas,
  width: number,
  height: number,
  config: AcademicConfig,
  pageNumber: number,
  totalPages: number
) {
  const longSide = Math.max(width, height);

  if (config.enableBorder) {
    const inset = STAMP_INSET_RATIO * longSide;
    const borderPaint = Skia.Paint();
    borderPaint.setStyle(PaintStyle.Stroke);
    borderPaint.setStrokeWidth(STAMP_BORDER_WIDTH_RATIO * longSide);
    borderPaint.setColor(Skia.Color(STAMP_TEXT_COLOR));
    borderPaint.setAntiAlias(true);
    canvas.drawRect(Skia.XYWHRect(inset, inset, width - inset * 2, height - inset * 2), borderPaint);
  }

  const size = STAMP_FONT_SIZE_RATIO * longSide;
  if (config.headerText) {
    const text = fillPageNumbers(config.headerText, pageNumber, totalPages);
    drawShaped(canvas, text, STAMP_INSET_RATIO * longSide, HEADER_Y_RATIO * longSide, size, false, 'left', STAMP_TEXT_COLOR);
  }
  if (config.footerText) {
    const text = fillPageNumbers(config.footerText, pageNumber, totalPages);
    drawShaped(canvas, text, width / 2, height - FOOTER_Y_RATIO * longSide, size, false, 'center', STAMP_TEXT_COLOR);
  }
}

// Bakes the border/header/footer onto a COPY of one content page's image (never the source uri -
// same never-mutate-the-original convention as bakeEnhance). pageNumber/totalPages are 1-based and
// exclude the cover page, matching the "Page X of Y" convention pdfService.ts's vector stamping
// already uses.
export async function stampContentPageImage(
  uri: string,
  config: AcademicConfig,
  pageNumber: number,
  totalPages: number
): Promise<{ uri: string; width: number; height: number }> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`academicRasterService: failed to decode image at ${uri}`);

  const width = image.width();
  const height = image.height();

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('academicRasterService: Skia failed to create an offscreen surface');
  const canvas = surface.getCanvas();
  canvas.drawImage(image, 0, 0);
  drawAcademicStamp(canvas, width, height, config, pageNumber, totalPages);

  const stampedUri = await writeJpeg(surface, 'stamped');
  return { uri: stampedUri, width, height };
}
