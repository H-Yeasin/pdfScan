import { File, Paths } from 'expo-file-system';
import { FontStyle, ImageFormat, PaintStyle, Skia } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';
import type { AcademicConfig, CoverPageConfig } from './pdfService';

// ReaderScreen now renders the real compiled PDF (via PdfPageView), so this module's cover/
// border/header-footer visuals are no longer needed to make the in-app reader match the export.
// It's still load-bearing for two other things that DO consume LibraryPage.fileUri directly:
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

// A4-ratio pixel canvas (1200 matches scannerPipeline.ts's MAX_DIMENSION convention for a normal
// scanned page's long side), matching pdfService.ts's real A4 cover page's proportions.
const COVER_RASTER_WIDTH_PX = 849;
const COVER_RASTER_HEIGHT_PX = 1200;
// Ratios (of COVER_RASTER_HEIGHT_PX) rather than absolute pixel sizes, unlike pdfService.ts's own
// COVER_TITLE_FONT_SIZE/etc (which are absolute PDF points - a real physical unit, independent of
// page size). This raster canvas's pixel grid has no such fixed physical meaning, so its text size
// must scale with the canvas or it renders cramped/tiny relative to the page - same reasoning as
// STAMP_FONT_SIZE_RATIO just above.
const COVER_TITLE_FONT_SIZE_RATIO = 24 / 792;
const COVER_SUBTITLE_FONT_SIZE_RATIO = 14 / 792;
const COVER_META_FONT_SIZE_RATIO = 12 / 792;
const COVER_SUBTITLE_Y_OFFSET_RATIO = 40 / 792;
const COVER_META_Y_OFFSET_RATIO = 64 / 792;

// No bundled font file / fontkit exists in this project (see pdfService.ts's own StandardFonts-
// only convention), so text is drawn with the platform's default system font via FontMgr.System()
// rather than requiring a shipped TTF asset.
function systemFont(size: number, bold: boolean) {
  const typeface = Skia.FontMgr.System().matchFamilyStyle('', bold ? FontStyle.Bold : FontStyle.Normal);
  return Skia.Font(typeface, size);
}

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
  cover: CoverPageConfig
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
    const width = COVER_RASTER_WIDTH_PX;
    const height = COVER_RASTER_HEIGHT_PX;
    const surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) throw new Error('Skia failed to create an offscreen surface for the cover page');
    const canvas = surface.getCanvas();
    canvas.drawColor(Skia.Color('#ffffff'));

    const textPaint = Skia.Paint();
    textPaint.setColor(Skia.Color(STAMP_TEXT_COLOR));
    textPaint.setAntiAlias(true);

    const drawCentered = (text: string, y: number, size: number, bold: boolean) => {
      const font = systemFont(size, bold);
      const textWidth = font.measureText(text, textPaint).width;
      canvas.drawText(text, (width - textWidth) / 2, y, textPaint, font);
    };

    if (cover.title) drawCentered(cover.title, height * 0.4, COVER_TITLE_FONT_SIZE_RATIO * height, true);
    if (cover.studentName) {
      drawCentered(cover.studentName, height * 0.4 + COVER_SUBTITLE_Y_OFFSET_RATIO * height, COVER_SUBTITLE_FONT_SIZE_RATIO * height, false);
    }
    if (cover.courseCode) {
      drawCentered(cover.courseCode, height * 0.4 + COVER_META_Y_OFFSET_RATIO * height, COVER_META_FONT_SIZE_RATIO * height, false);
    }

    const uri = await writeJpeg(surface, 'cover');
    return { uri, width, height };
  } catch (error) {
    console.warn('academicRasterService: failed to render template cover page', error);
    return null;
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
  const longSide = Math.max(width, height);

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('academicRasterService: Skia failed to create an offscreen surface');
  const canvas = surface.getCanvas();
  canvas.drawImage(image, 0, 0);

  if (config.enableBorder) {
    const inset = STAMP_INSET_RATIO * longSide;
    const borderPaint = Skia.Paint();
    borderPaint.setStyle(PaintStyle.Stroke);
    borderPaint.setStrokeWidth(STAMP_BORDER_WIDTH_RATIO * longSide);
    borderPaint.setColor(Skia.Color(STAMP_TEXT_COLOR));
    borderPaint.setAntiAlias(true);
    canvas.drawRect(Skia.XYWHRect(inset, inset, width - inset * 2, height - inset * 2), borderPaint);
  }

  if (config.headerText || config.footerText) {
    const textPaint = Skia.Paint();
    textPaint.setColor(Skia.Color(STAMP_TEXT_COLOR));
    textPaint.setAntiAlias(true);
    const font = systemFont(STAMP_FONT_SIZE_RATIO * longSide, false);

    if (config.headerText) {
      canvas.drawText(config.headerText, STAMP_INSET_RATIO * longSide, HEADER_Y_RATIO * longSide, textPaint, font);
    }

    if (config.footerText) {
      const text = config.footerText.replace('{X}', String(pageNumber)).replace('{Y}', String(totalPages));
      const textWidth = font.measureText(text, textPaint).width;
      canvas.drawText(text, (width - textWidth) / 2, height - FOOTER_Y_RATIO * longSide, textPaint, font);
    }
  }

  const stampedUri = await writeJpeg(surface, 'stamped');
  return { uri: stampedUri, width, height };
}
