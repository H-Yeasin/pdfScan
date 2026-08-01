import { File, Paths } from 'expo-file-system';
import { FilterMode, ImageFormat, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';
import { DEFAULT_ADJUST, isDefaultAdjust } from './adjust';
import type { AdjustValues, EnhanceMode } from '../../types/models';

const GRAYSCALE_MATRIX = [
  0.299, 0.587, 0.114, 0, 0,
  0.299, 0.587, 0.114, 0, 0,
  0.299, 0.587, 0.114, 0, 0,
  0, 0, 0, 1, 0,
];

function contrastMatrix(contrast: number) {
  // Skia's ColorFilter.MakeMatrix operates on unpremultiplied 0.0-1.0 float components (clamped
  // to that range), not 0-255 - a *255 term here made the translate wildly negative for any
  // contrast > 1, clamping every pixel to black regardless of input.
  const t = (1 - contrast) / 2;
  return [
    contrast, 0, 0, 0, t,
    0, contrast, 0, 0, t,
    0, 0, contrast, 0, t,
    0, 0, 0, 1, 0,
  ];
}

// brightness in -1..1, scaled to a max ±0.3 additive shift in Skia's unpremultiplied 0.0-1.0
// pixel space (same convention as contrastMatrix above).
function brightnessMatrix(brightness: number) {
  const t = brightness * 0.3;
  return [
    1, 0, 0, 0, t,
    0, 1, 0, 0, t,
    0, 0, 1, 0, t,
    0, 0, 0, 1, 0,
  ];
}

// saturation in -1..1 maps to a 0..2 multiplier (0 = grayscale, 1 = unchanged, 2 = oversaturated),
// interpolating each channel against the same luminance weights used by GRAYSCALE_MATRIX. Applied
// to an already-grayscale image this is a no-op (R=G=B collapses the interpolation to identity),
// so it's safe to compose unconditionally even when the enhance mode is gray/bw.
function saturationMatrix(saturation: number) {
  const s = 1 + saturation;
  const lumR = 0.299;
  const lumG = 0.587;
  const lumB = 0.114;
  const sr = (1 - s) * lumR;
  const sg = (1 - s) * lumG;
  const sb = (1 - s) * lumB;
  return [
    sr + s, sg, sb, 0, 0,
    sr, sg + s, sb, 0, 0,
    sr, sg, sb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

// Composes brightness -> contrast -> saturation into a single ColorFilter, or null when every
// slider is at its default (so callers can skip the extra compose work entirely). contrast/
// saturation reuse the same 0..2-multiplier convention as contrastMatrix's `contrast` param.
function composeAdjustFilter(adjust: AdjustValues) {
  if (isDefaultAdjust(adjust)) return null;
  let filter = Skia.ColorFilter.MakeMatrix(brightnessMatrix(adjust.brightness));
  filter = Skia.ColorFilter.MakeCompose(Skia.ColorFilter.MakeMatrix(contrastMatrix(1 + adjust.contrast)), filter);
  filter = Skia.ColorFilter.MakeCompose(Skia.ColorFilter.MakeMatrix(saturationMatrix(adjust.saturation)), filter);
  return filter;
}

// Local-adaptive threshold: each pixel is compared against the average luminance of its own
// neighborhood rather than a single global cutoff. A shadow darkens a whole neighborhood
// together, so comparing a pixel to its *local* average cancels the shadow out, while ink
// (meaningfully darker than its immediate surroundings) still crosses the threshold. A true
// multi-pass box blur/integral image isn't possible in a single fragment-shader pass, so the
// local average is approximated with a fixed 5x5 sparse tap grid; `sampleRadius` scales the tap
// spacing so the window covers roughly the same relative neighborhood at any photo resolution.
const DOCUMENT_SCAN_SKSL = `
uniform shader image;
uniform float thresholdBalance;
uniform float sampleRadius;

float luma(vec4 c) {
  return dot(c.rgb, vec3(0.299, 0.587, 0.114));
}

vec4 main(vec2 fragCoord) {
  float centerLuma = luma(image.eval(fragCoord));

  float sum = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2 offset = vec2(float(dx), float(dy)) * sampleRadius;
      sum += luma(image.eval(fragCoord + offset));
    }
  }
  float localAverage = sum / 25.0;

  float edge = localAverage - thresholdBalance * localAverage;
  float isBackground = step(edge, centerLuma);
  return vec4(isBackground, isBackground, isBackground, 1.0);
}
`;

const THRESHOLD_BALANCE = 0.15;
const SAMPLE_RADIUS_RATIO = 0.006; // tap spacing as a fraction of the longer image dimension

// Compiled once and cached at module scope so the shader isn't recompiled on every page.
let documentScanEffect: ReturnType<typeof Skia.RuntimeEffect.Make> | null = null;
function getDocumentScanEffect() {
  if (!documentScanEffect) {
    documentScanEffect = Skia.RuntimeEffect.Make(DOCUMENT_SCAN_SKSL);
    if (!documentScanEffect) throw new Error('Skia failed to compile the document_scan shader');
  }
  return documentScanEffect;
}

export type BakeableEnhance = 'gray' | 'bw' | 'document_scan';
export const BAKEABLE_MODES: readonly BakeableEnhance[] = ['gray', 'bw', 'document_scan'];
export function isBakeableEnhance(mode: string): mode is BakeableEnhance {
  return (BAKEABLE_MODES as readonly string[]).includes(mode);
}

// Whether a page needs a real pixel bake at all: either its enhance mode does (gray/bw/
// document_scan), or the user has moved a brightness/contrast/saturation slider off center.
// auto/color stay pass-through when adjust is untouched, same as before this existed.
export function needsBake(mode: EnhanceMode, adjust: AdjustValues): boolean {
  return isBakeableEnhance(mode) || !isDefaultAdjust(adjust);
}

// Real pixel-level bake using Skia — runs the page through an offscreen GPU surface. gray/bw use
// a color matrix (grayscale, plus a contrast push for bw); document_scan runs a local-adaptive
// threshold RuntimeEffect shader instead, to strip shadows a global matrix can't tell from ink.
// Manual brightness/contrast/saturation adjustments are composed in as an extra color matrix
// ahead of the mode's own filter (so they act as pre-processing on the original color image);
// document_scan's shader already collapses everything to pure black/white, so adjust is ignored
// there — there's no continuous tone left to adjust. Always writes a new JPEG file; never touches
// the source page's original image.
export async function bakeEnhance(
  uri: string,
  mode: EnhanceMode,
  adjust: AdjustValues = DEFAULT_ADJUST
): Promise<{ uri: string; width: number; height: number }> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`Skia failed to decode image at ${uri}`);

  const width = image.width();
  const height = image.height();

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('Skia failed to create an offscreen surface');

  const paint = Skia.Paint();
  const canvas = surface.getCanvas();

  if (mode === 'document_scan') {
    const imageShader = image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
    const shader = getDocumentScanEffect().makeShaderWithChildren(
      [THRESHOLD_BALANCE, SAMPLE_RADIUS_RATIO * Math.max(width, height)],
      [imageShader]
    );
    paint.setShader(shader);
    canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
  } else {
    const adjustFilter = composeAdjustFilter(adjust);
    let colorFilter = adjustFilter;
    if (mode === 'gray' || mode === 'bw') {
      const grayscaleFilter = Skia.ColorFilter.MakeMatrix(GRAYSCALE_MATRIX);
      const modeFilter =
        mode === 'bw' ? Skia.ColorFilter.MakeCompose(Skia.ColorFilter.MakeMatrix(contrastMatrix(2.1)), grayscaleFilter) : grayscaleFilter;
      colorFilter = colorFilter ? Skia.ColorFilter.MakeCompose(modeFilter, colorFilter) : modeFilter;
    }
    if (colorFilter) paint.setColorFilter(colorFilter);
    canvas.drawImage(image, 0, 0, paint);
  }
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 92);

  const dest = new File(Paths.cache, `${createId('enhanced')}.jpg`);
  dest.write(bytes);

  return { uri: dest.uri, width, height };
}
