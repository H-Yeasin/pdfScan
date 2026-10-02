import { StandardFontEmbedder, StandardFonts, rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage, type PDFRef } from 'pdf-lib';
import { measureShaped, rasterizeShaped, type ShapedRun } from './skiaText';
import { drawOcrTextLayer, embedGlyphlessFont } from './textLayer';
import { isWinAnsiSafe } from './winAnsi';

// Visible PDF text in any script (§6 L3): covers, headers and footers.
//   - Text Helvetica can draw (WinAnsi) stays Helvetica vector text: smallest and sharpest, and
//     unchanged from before L3.
//   - Anything else is shaped by Skia (skiaText.ts, system fonts), drawn as a transparent PNG at
//     300 dpi in the same box, with the same text in the glyphless text layer (textLayer.ts) over
//     it, so it is still searchable and copyable.
// The decision is per run (one laid-out line): a line mixing an English course name with a Bangla
// student name is shaped as a whole, so its spacing stays consistent.

export type Align = 'left' | 'center';

// Measures and rasterizes runs that need shaping. Skia in the app; tests swap in a fake through
// setTextShaper, since Skia can't run under Jest.
export type TextShaper = {
  measure(text: string, size: number, bold: boolean): ShapedRun;
  rasterize(text: string, size: number, bold: boolean, pxPerUnit: number): { png: Uint8Array; run: ShapedRun };
};

const skiaShaper: TextShaper = { measure: measureShaped, rasterize: rasterizeShaped };
let shaper: TextShaper = skiaShaper;

// Test hook; returns the undo.
export function setTextShaper(next: TextShaper): () => void {
  const previous = shaper;
  shaper = next;
  return () => {
    shaper = previous;
  };
}

export function needsShaping(text: string): boolean {
  return !isWinAnsiSafe(text);
}

// pdf-lib types StandardFontEmbedder.for with @pdf-lib/standard-fonts' own enum, which has the
// same string values as the StandardFonts it exports.
type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
const helvetica = StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as FontName);
const helveticaBold = StandardFontEmbedder.for(StandardFonts.HelveticaBold as unknown as FontName);

export type MeasureText = (text: string, size: number, bold: boolean) => number;

export const helveticaWidth: MeasureText = (text, size, bold) => (bold ? helveticaBold : helvetica).widthOfTextAtSize(text, size);

// What Helvetica draws for text it can't encode: '?' per character. Only a fallback now, for when
// shaping fails (it never sinks an export).
export function toHelveticaSafe(text: string): string {
  let out = '';
  for (const ch of text) out += isWinAnsiSafe(ch) ? ch : '?';
  return out;
}

function shapedOrNull<T>(work: () => T): T | null {
  try {
    return work();
  } catch (error) {
    console.warn('visibleText: shaping failed, falling back to Helvetica', error);
    return null;
  }
}

// Width of one run in points, the way drawText will draw it. Used for layout (wrapping, centring).
export const measureText: MeasureText = (text, size, bold) => {
  if (!needsShaping(text)) return helveticaWidth(text, size, bold);
  return shapedOrNull(() => shaper.measure(text, size, bold).width) ?? helveticaWidth(toHelveticaSafe(text), size, bold);
};

const RASTER_DPI = 300;
const PX_PER_PT = RASTER_DPI / 72;
const INK = rgb(0.1, 0.1, 0.1);

export type DrawTextOptions = {
  // PDF coordinates (bottom-left origin): `x` is the left edge, or the centre for 'center'; `y` is
  // the baseline.
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  align?: Align;
};

export type TextDrawer = {
  draw(page: PDFPage, text: string, options: DrawTextOptions): Promise<void>;
};

// One per PDF being built: embeds Helvetica and the glyphless font on first use, and each distinct
// shaped run once (a header without a page number repeats on every page). Pass the glyphless font
// if the PDF already has it (the OCR layer's), so it isn't embedded twice.
export function createTextDrawer(pdfDoc: PDFDocument, glyphlessFont?: PDFRef): TextDrawer {
  const fonts = new Map<boolean, Promise<PDFFont>>();
  const font = (bold: boolean) => {
    let f = fonts.get(bold);
    if (!f) {
      f = pdfDoc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
      fonts.set(bold, f);
    }
    return f;
  };
  let glyphless: Promise<PDFRef> | null = glyphlessFont ? Promise.resolve(glyphlessFont) : null;
  const images = new Map<string, Promise<{ image: PDFImage; run: ShapedRun } | null>>();

  const shapedImage = (text: string, size: number, bold: boolean) => {
    const key = `${bold ? 'b' : 'r'}${size}|${text}`;
    let entry = images.get(key);
    if (!entry) {
      entry = (async () => {
        const shaped = shapedOrNull(() => shaper.rasterize(text, size, bold, PX_PER_PT));
        return shaped ? { image: await pdfDoc.embedPng(shaped.png), run: shaped.run } : null;
      })();
      images.set(key, entry);
    }
    return entry;
  };

  return {
    async draw(page, rawText, { x, y, size, bold = false, align = 'left' }) {
      const text = rawText.trim();
      if (!text) return;

      if (!needsShaping(text)) {
        const f = await font(bold);
        const left = align === 'center' ? x - f.widthOfTextAtSize(text, size) / 2 : x;
        page.drawText(text, { x: left, y, size, font: f, color: INK });
        return;
      }

      const shaped = await shapedImage(text, size, bold);
      let box: { left: number; width: number; ascent: number; descent: number };
      if (shaped) {
        const { width, ascent, descent } = shaped.run;
        const left = align === 'center' ? x - width / 2 : x;
        page.drawImage(shaped.image, { x: left, y: y - descent, width, height: ascent + descent });
        box = { left, width, ascent, descent };
      } else {
        // Shaping failed (it shouldn't): show what Helvetica can, and still make it searchable.
        const f = await font(bold);
        const safe = toHelveticaSafe(text);
        const width = f.widthOfTextAtSize(safe, size);
        const left = align === 'center' ? x - width / 2 : x;
        page.drawText(safe, { x: left, y, size, font: f, color: INK });
        box = { left, width, ascent: size * 0.8, descent: size * 0.2 };
      }

      // The real text, invisible, over the drawn box: the glyphless layer puts a line's baseline
      // on its box's bottom edge, so the box runs from the baseline up by the ascent.
      if (!glyphless) glyphless = embedGlyphlessFont(pdfDoc);
      const pageHeight = page.getHeight();
      const bounding = { left: box.left, top: pageHeight - (y + box.ascent), width: box.width, height: box.ascent };
      drawOcrTextLayer(page, await glyphless, { text, blocks: [{ text, bounding, lines: [{ text, bounding }] }] }, {
        origin: { x: 0, y: 0 },
        heightPt: pageHeight,
        scale: 1,
      });
    },
  };
}
