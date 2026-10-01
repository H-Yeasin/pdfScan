// Pure maths for the Ink filter (no Skia). ink.ts runs the SAME formulas per pixel in SkSL; keep
// the two in sync line for line. Everything works on light-corrected values (lightCorrect.ts), so
// paper is already near PAPER_WHITE wherever it was lit.
//
// Ink is not a threshold. A threshold (Sauvola, the B&W filter) decides ink-or-paper per pixel,
// which turns the soft grey edge of a pencil stroke into jagged stairs and drops faint strokes
// entirely. The tone curve here instead maps three ranges smoothly:
//   - above the paper knee: pure white (paper texture, faint smudges, faded ruling disappear);
//   - below the ink knee: ink, pushed darker by a gamma curve so pencil reads like pen;
//   - in between: a smoothstep from the ink tone to white, which keeps anti-aliased edges soft.

export type InkKnees = { ink: number; paper: number };
export type InkToneParams = { inkCeil: number; inkGamma: number };
export type LineFadeParams = { lineFrac: number; lineSatMax: number };

export const DEFAULT_KNEES: InkKnees = { ink: 0.45, paper: 0.82 };
export const INK_CEIL = 0.3; // what the ink knee maps to; everything darker than the knee lands in 0..INK_CEIL
export const INK_GAMMA = 1.5; // > 1 pulls everything below the ink knee toward black faster than linear
export const LINE_FRAC = 0.4; // ruling-line luma threshold, as a fraction of the way from the ink knee to the paper knee
export const LINE_SAT_MAX = 0.35; // max chroma (max-min channel) a ruling line can have; pen ink is more saturated
export const DEFAULT_FADE_LINES = true; // FilterOptions.fadeLines when unset
export const DEFAULT_KEEP_INK_COLOR = false; // FilterOptions.keepInkColor when unset
export const INK_PERCENTILE = 0.02; // darkest 2% of a notes page is ink
const PAPER_KNEE_FRAC = 0.75;
const INK_KNEE_FRAC = 0.35;
const MIN_INK_SPAN = 0.2; // below this paper-ink gap there's too little ink to measure; use DEFAULT_KNEES

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function percentileFromHistogram(counts: ArrayLike<number>, total: number, p: number): number {
  const target = total * p;
  let seen = 0;
  for (let i = 0; i < 256; i++) {
    seen += counts[i];
    if (seen >= target) return i / 255;
  }
  return 1;
}

// Knee adaptation. `paperLuma` is the corrected page's median luma (paper dominates a notes page)
// and `inkLuma` its INK_PERCENTILE luma. Pencil measures much lighter than pen, so its knees move
// up with it, and pencil ends up below the ink knee (dark) instead of in the soft middle (grey).
export function inkKnees(paperLuma: number, inkLuma: number): InkKnees {
  const span = paperLuma - inkLuma;
  if (!(span >= MIN_INK_SPAN)) return DEFAULT_KNEES;
  const paper = clamp(inkLuma + PAPER_KNEE_FRAC * span, 0.6, 0.92);
  const ink = clamp(inkLuma + INK_KNEE_FRAC * span, 0.2, paper - 0.1);
  return { ink, paper };
}

export function inkTone(luma: number, knees: InkKnees, { inkCeil, inkGamma }: InkToneParams): number {
  if (luma <= knees.ink) return Math.pow(Math.max(luma, 0) / knees.ink, inkGamma) * inkCeil;
  return inkCeil + (1 - inkCeil) * smoothstep(knees.ink, knees.paper, luma);
}

// How far (0..1) a pixel is faded to white as a ruling or grid line: lighter than the line
// threshold AND low in chroma. Pen ink is darker or more saturated (or both), so it survives.
// Any hue counts - blue, red, grey and the occasional green grid all fade the same way.
export function lineFade(luma: number, chroma: number, knees: InkKnees, { lineFrac, lineSatMax }: LineFadeParams): number {
  const threshold = knees.ink + lineFrac * (knees.paper - knees.ink);
  return smoothstep(threshold - 0.03, threshold + 0.03, luma) * (1 - smoothstep(lineSatMax - 0.05, lineSatMax + 0.05, chroma));
}
