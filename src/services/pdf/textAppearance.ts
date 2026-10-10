import { StandardFontEmbedder, StandardFonts, type PDFDocument, type PDFRef } from 'pdf-lib';
import { rasterizeShapedAlpha, type ShapedRun } from './skiaText';
import { isWinAnsiSafe } from './winAnsi';

// §12 D10: typed text inside an appearance stream (a text box annotation, a filled form field), in
// any script, built synchronously (pdfAnnotations' writers are synchronous per mark). Like visibleText (§6 L3), per line:
//   - text Helvetica can draw (WinAnsi) is Helvetica vector text (a standard font: nothing embedded);
//   - anything else is shaped by Skia and drawn as an image in the text's colour, masked by the
//     shaped run's alpha (raw pixels into Flate streams; a PNG would need pdf-lib's async embedder).
// The real text sits in the annotation's /Contents or the field's /V, so search and copy in other
// apps still find it.

export type TextRaster = (text: string, sizePt: number, pxPerPt: number) => { width: number; height: number; alpha: Uint8Array; run: ShapedRun };

let raster: TextRaster = rasterizeShapedAlpha;

// Test hook (Skia can't run under Jest); returns the undo.
export function setTextRaster(next: TextRaster): () => void {
  const previous = raster;
  raster = next;
  return () => {
    raster = previous;
  };
}

type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
const helvetica = StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as FontName);

// The Helvetica resource name in our appearance streams (and in a text box's /DA).
export const HELV = 'Helv';
// Line height and the baseline's distance from a line's top, as shares of the font size.
export const LINE_HEIGHT = 1.2;
export const ASCENT = 0.8;
// A shaped line is rasterized at this many pixels per point (300 dpi, like visibleText).
const PX_PER_PT = 300 / 72;

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export type Rgb = readonly [number, number, number];

// pdf-lib's literal dictionary type (not exported by name).
type Literal = NonNullable<Parameters<PDFDocument['context']['stream']>[1]>;

export type TextAppearance = {
  // Content-stream operators; the caller wraps them (a `cm` to place and turn the frame, a clip).
  content: string;
  resources: Literal;
};

export function helveticaFontDict(pdfDoc: PDFDocument): PDFRef {
  return pdfDoc.context.register(pdfDoc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' }));
}

// The colour image behind a shaped line, masked by its alpha.
function shapedImage(pdfDoc: PDFDocument, text: string, sizePt: number, color: Rgb): { ref: PDFRef; run: ShapedRun } | null {
  let shaped: ReturnType<TextRaster>;
  try {
    shaped = raster(text, sizePt, PX_PER_PT);
  } catch (e) {
    console.warn('textAppearance: shaping failed', e);
    return null;
  }
  const { width, height, alpha, run } = shaped;
  const ctx = pdfDoc.context;
  const mask = ctx.register(ctx.flateStream(alpha, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }));
  const rgb = new Uint8Array(width * height * 3);
  const [r, g, b] = color.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255));
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = r;
    rgb[i + 1] = g;
    rgb[i + 2] = b;
  }
  const ref = ctx.register(
    ctx.flateStream(rgb, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, SMask: mask })
  );
  return { ref, run };
}

// Draws `lines` in a frame whose origin is the text's top-left corner, x to the right and y up:
// line i's baseline is at y = -(ASCENT + i * LINE_HEIGHT) * size, starting at x = `left`.
// What Helvetica can't draw and Skia can't shape (it shouldn't happen) shows as '?'.
export function textLinesAppearance(pdfDoc: PDFDocument, lines: readonly string[], opts: { sizePt: number; color: Rgb; left?: number; helv?: PDFRef }): TextAppearance {
  const { sizePt: size, color } = opts;
  const left = opts.left ?? 0;
  const ops: string[] = [];
  const xobjects: Record<string, PDFRef> = {};
  let usesHelv = false;
  lines.forEach((line, i) => {
    if (!line) return;
    const baseline = -(ASCENT + i * LINE_HEIGHT) * size;
    const shaped = isWinAnsiSafe(line) ? null : shapedImage(pdfDoc, line, size, color);
    if (shaped) {
      const name = `Tx${Object.keys(xobjects).length}`;
      xobjects[name] = shaped.ref;
      const { width, ascent, descent } = shaped.run;
      ops.push(`q ${fmt(width)} 0 0 ${fmt(ascent + descent)} ${fmt(left)} ${fmt(baseline - descent)} cm /${name} Do Q`);
      return;
    }
    const safe = isWinAnsiSafe(line) ? line : [...line].map((ch) => (isWinAnsiSafe(ch) ? ch : '?')).join('');
    usesHelv = true;
    ops.push(`BT /${HELV} ${fmt(size)} Tf ${color.map(fmt).join(' ')} rg ${fmt(left)} ${fmt(baseline)} Td ${helvetica.encodeText(safe).toString()} Tj ET`);
  });
  const resources: Literal = {};
  if (usesHelv) resources.Font = { [HELV]: opts.helv ?? helveticaFontDict(pdfDoc) };
  if (Object.keys(xobjects).length) resources.XObject = xobjects;
  return { content: ops.join('\n'), resources };
}

// One line's width in points, the way textLinesAppearance draws it (an estimate for shaped text
// is fine for layout: callers only size boxes with it).
export function helveticaLineWidth(text: string, sizePt: number): number {
  return helvetica.widthOfTextAtSize([...text].map((ch) => (isWinAnsiSafe(ch) ? ch : 'n')).join(''), sizePt);
}
