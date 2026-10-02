import { FontWeight, ImageFormat, Skia, TextAlign, type SkCanvas, type SkParagraph } from '@shopify/react-native-skia';

// Text in any script, shaped by Skia's Paragraph API (§6 L3): HarfBuzz shaping (Bengali and
// Devanagari conjuncts, CJK) with the phone's own system fonts. A ParagraphBuilder made without a
// typeface provider uses the system font manager with per-character fallback, so a Bangla name in
// an English sentence picks a Bengali font for just those characters. No font files are bundled;
// L3's device spike is meant to confirm the fallback on real phones (if it fails on a platform,
// the plan is to bundle one Noto Sans per script and pass it through a TypefaceFontProvider here).
//
// Everything is one line: callers wrap first (coverTemplates.wrapText) and draw each line as a run.

// Metrics of one shaped run, in the same units as the font size it was shaped at.
export type ShapedRun = { width: number; ascent: number; descent: number };

const INK = '#1a1a1a';
// Wide enough that no line ever wraps inside Skia; widths come from the intrinsic width.
const UNBOUNDED = 100_000;

function makeParagraph(text: string, size: number, bold: boolean, color: string): SkParagraph {
  const builder = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Left, maxLines: 1 });
  builder.pushStyle({
    color: Skia.Color(color),
    fontSize: size,
    fontStyle: { weight: bold ? FontWeight.Bold : FontWeight.Normal },
  });
  builder.addText(text);
  const paragraph = builder.build();
  paragraph.layout(UNBOUNDED);
  return paragraph;
}

function runOf(paragraph: SkParagraph, size: number): ShapedRun {
  const line = paragraph.getLineMetrics()[0];
  return {
    width: paragraph.getMaxIntrinsicWidth(),
    // A run with no line metrics (empty text) still gets a sensible box.
    ascent: line?.ascent ?? size * 0.8,
    descent: line?.descent ?? size * 0.2,
  };
}

// Baseline offset from the paragraph's top edge (Paragraph.paint takes the top-left corner).
function baselineOf(paragraph: SkParagraph, run: ShapedRun): number {
  return paragraph.getLineMetrics()[0]?.baseline ?? run.ascent;
}

export function measureShaped(text: string, size: number, bold: boolean): ShapedRun {
  return runOf(makeParagraph(text, size, bold, INK), size);
}

// Draws one run on a Skia canvas with its baseline at `baseline`; `x` is the left edge, or the
// centre for 'center'. Used for the library display copies (academicRasterService) and Review's
// live stamp preview, so they shape text exactly like the PDF's images.
export function drawShaped(
  canvas: SkCanvas,
  text: string,
  x: number,
  baseline: number,
  size: number,
  bold: boolean,
  align: 'left' | 'center' = 'left',
  color: string = INK
): void {
  const paragraph = makeParagraph(text, size, bold, color);
  const run = runOf(paragraph, size);
  const left = align === 'center' ? x - run.width / 2 : x;
  paragraph.paint(canvas, left, baseline - baselineOf(paragraph, run));
}

// A run as a transparent PNG, `pxPerUnit` pixels per font-size unit (pdfService passes 300 dpi
// over 72 pt). Metrics come back in font-size units; the image is exactly width x (ascent +
// descent) of them, rounded up to whole pixels, with the baseline `ascent` from its top.
export function rasterizeShaped(text: string, size: number, bold: boolean, pxPerUnit: number): { png: Uint8Array; run: ShapedRun } {
  const paragraph = makeParagraph(text, size * pxPerUnit, bold, INK);
  const px = runOf(paragraph, size * pxPerUnit);
  const width = Math.max(1, Math.ceil(px.width));
  const height = Math.max(1, Math.ceil(px.ascent + px.descent));
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('skiaText: failed to create an offscreen surface');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  paragraph.paint(canvas, 0, px.ascent - baselineOf(paragraph, px));
  surface.flush();
  const png = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG, 100);
  return { png, run: { width: width / pxPerUnit, ascent: px.ascent / pxPerUnit, descent: (height - px.ascent) / pxPerUnit } };
}
