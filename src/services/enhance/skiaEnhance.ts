import { File, Paths } from 'expo-file-system';
import { AlphaType, ColorType, FilterMode, ImageFormat, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
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

// --- Content-adaptive analysis (Auto/Color/Gray/B&W) -----------------------------------------
//
// auto/color/gray/bw all derive their per-image "look" from a real histogram analysis of the
// page, rather than a fixed matrix - this is what makes them actually distinct from each other
// (previously auto/color were literal no-op pass-throughs, identical to each other and to the
// untouched source). A small downscaled copy of the page is drawn and read back once per bake;
// everything downstream is plain per-channel arithmetic on a 2304-pixel buffer.

type ChannelStats = { lo: number; hi: number };
type ImageStats = { r: ChannelStats; g: ChannelStats; b: ChannelStats; luma: ChannelStats };

const ANALYSIS_SIZE = 48;
const CLIP_PERCENT = 0.01; // trim the darkest/brightest 1% per channel before finding endpoints, so a few noise/blown-out pixels can't anchor the whole stretch
const LUMA_MIN_SPAN = 0.15; // floor on (hi-lo) for the gray/bw luminance stretch
const COLOR_MIN_SPAN = 0.25; // wider floor for auto/color's per-channel stretch - per-channel noise shouldn't drive a color correction
const BW_CONTRAST_BOOST = 1.8; // extra push on top of the already-stretched luma, for a punchier look than Gray
const COLOR_SATURATION_BOOST = 0.25; // 1.25x - the per-channel stretch already adds apparent vividness, so this stacks on top of it

// Downscales the page to ANALYSIS_SIZE and reads back real pixels to build per-channel and
// luminance histograms. Cheap and fixed-cost regardless of source resolution (one small draw +
// a 2304-pixel loop), independent of the full-res render pass that follows it.
function analyzeImage(image: SkImage): ImageStats {
  const analysisSurface = Skia.Surface.MakeOffscreen(ANALYSIS_SIZE, ANALYSIS_SIZE);
  if (!analysisSurface) throw new Error('Skia failed to create the analysis offscreen surface');
  analysisSurface
    .getCanvas()
    .drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE),
      FilterMode.Linear,
      MipmapMode.Linear
    );
  analysisSurface.flush();
  const pixels = analysisSurface.makeImageSnapshot().readPixels(0, 0, {
    width: ANALYSIS_SIZE,
    height: ANALYSIS_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  }) as Uint8Array | null;
  if (!pixels) throw new Error('Skia failed to read back analysis pixels');

  const rCounts = new Uint32Array(256);
  const gCounts = new Uint32Array(256);
  const bCounts = new Uint32Array(256);
  const lumaCounts = new Uint32Array(256);
  const total = ANALYSIS_SIZE * ANALYSIS_SIZE;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    rCounts[r]++;
    gCounts[g]++;
    bCounts[b]++;
    // Must stay in sync with GRAYSCALE_MATRIX's luminance weights - this is what makes
    // lumaLevelsMatrix's stretch exactly equivalent to stretching the eventual gray output.
    lumaCounts[Math.round(0.299 * r + 0.587 * g + 0.114 * b)]++;
  }

  return {
    r: channelStatsFromHistogram(rCounts, total),
    g: channelStatsFromHistogram(gCounts, total),
    b: channelStatsFromHistogram(bCounts, total),
    luma: channelStatsFromHistogram(lumaCounts, total),
  };
}

function channelStatsFromHistogram(counts: Uint32Array, total: number): ChannelStats {
  const clipCount = Math.max(1, Math.floor(total * CLIP_PERCENT));
  let seen = 0;
  let lo = 0;
  for (let i = 0; i < 256; i++) {
    seen += counts[i];
    if (seen > clipCount) {
      lo = i;
      break;
    }
  }
  seen = 0;
  let hi = 255;
  for (let i = 255; i >= 0; i--) {
    seen += counts[i];
    if (seen > clipCount) {
      hi = i;
      break;
    }
  }
  return { lo: lo / 255, hi: hi / 255 };
}

// Converts a measured [lo,hi] range into a linear-stretch scale/translate. If the measured span
// is narrower than minSpan (a near-blank or very low-contrast page), the window is widened
// symmetrically around its own midpoint rather than just flooring the denominator - flooring the
// denominator alone while still anchoring the translate to the original (narrow) lo crushes
// shadows to black on e.g. a lightly-vignetted blank page, which is the opposite of "whiten the
// paper". Widening keeps both endpoints moving together, so a bright-but-flat page stays bright
// and a dark-but-flat page opens toward mid-gray instead of getting darker.
function levelsScale(lo: number, hi: number, minSpan: number): { scale: number; translate: number } {
  let effLo = lo;
  let effHi = hi;
  if (effHi - effLo < minSpan) {
    const mid = (effLo + effHi) / 2;
    effLo = mid - minSpan / 2;
    effHi = mid + minSpan / 2;
    if (effLo < 0) {
      effHi -= effLo;
      effLo = 0;
    }
    if (effHi > 1) {
      effLo -= effHi - 1;
      effHi = 1;
    }
    effLo = Math.max(0, effLo);
    effHi = Math.min(1, effHi);
  }
  const scale = 1 / (effHi - effLo);
  return { scale, translate: -effLo * scale };
}

// Per-channel black/white-point stretch - each of R/G/B is independently pulled to its own
// measured range, which is what makes this double as white-balance correction (paper trends
// toward neutral white, not just higher contrast) rather than a plain contrast boost.
function levelsMatrix(stats: ImageStats) {
  const r = levelsScale(stats.r.lo, stats.r.hi, COLOR_MIN_SPAN);
  const g = levelsScale(stats.g.lo, stats.g.hi, COLOR_MIN_SPAN);
  const b = levelsScale(stats.b.lo, stats.b.hi, COLOR_MIN_SPAN);
  return [
    r.scale, 0, 0, 0, r.translate,
    0, g.scale, 0, 0, g.translate,
    0, 0, b.scale, 0, b.translate,
    0, 0, 0, 1, 0,
  ];
}

// Luminance-only stretch applied identically to R/G/B - preserves color ratios (irrelevant here
// since this feeds straight into a grayscale conversion) while normalizing exposure/contrast
// using the page's own measured tonal range instead of a fixed matrix.
function lumaLevelsMatrix(stats: ImageStats) {
  const { scale, translate } = levelsScale(stats.luma.lo, stats.luma.hi, LUMA_MIN_SPAN);
  return [
    scale, 0, 0, 0, translate,
    0, scale, 0, 0, translate,
    0, 0, scale, 0, translate,
    0, 0, 0, 1, 0,
  ];
}

// The real per-mode "look" for auto/color/gray/bw, built from this page's own analyzed stats.
function baseModeFilter(mode: 'auto' | 'color' | 'gray' | 'bw', stats: ImageStats) {
  if (mode === 'auto') return Skia.ColorFilter.MakeMatrix(levelsMatrix(stats));
  if (mode === 'color') {
    const levels = Skia.ColorFilter.MakeMatrix(levelsMatrix(stats));
    const saturation = Skia.ColorFilter.MakeMatrix(saturationMatrix(COLOR_SATURATION_BOOST));
    return Skia.ColorFilter.MakeCompose(saturation, levels); // saturation(levels(x)) - correct color cast first, then boost vividness
  }
  const luma = Skia.ColorFilter.MakeMatrix(lumaLevelsMatrix(stats));
  const gray = Skia.ColorFilter.MakeCompose(Skia.ColorFilter.MakeMatrix(GRAYSCALE_MATRIX), luma);
  if (mode === 'gray') return gray;
  return Skia.ColorFilter.MakeCompose(Skia.ColorFilter.MakeMatrix(contrastMatrix(BW_CONTRAST_BOOST)), gray);
}

// --- Scan mode: Sauvola local-adaptive binarization -------------------------------------------
//
// Each pixel is thresholded against its local neighborhood's mean AND standard deviation, not
// mean alone - the literature-standard technique for degraded/unevenly-lit document binarization
// (Sauvola & Pietikainen). A shadow darkens a whole neighborhood together without changing its
// local variance much, so the mean half of the threshold cancels the shadow out; the stddev half
// makes the threshold more sensitive near real edges (text strokes) and more lenient in flat
// regions, which better preserves thin strokes than a mean-only comparison. A true multi-pass box
// blur/integral image isn't possible in a single fragment-shader pass, so both the local mean and
// variance are approximated with the same fixed 5x5 sparse tap grid; `sampleRadius` scales the
// tap spacing so the window covers roughly the same relative neighborhood at any photo resolution.
const DOCUMENT_SCAN_SKSL = `
uniform shader image;
uniform float k;
uniform float r;
uniform float sampleRadius;

float luma(vec4 c) {
  return dot(c.rgb, vec3(0.299, 0.587, 0.114));
}

vec4 main(vec2 fragCoord) {
  float centerLuma = luma(image.eval(fragCoord));

  float sum = 0.0;
  float sumSq = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2 offset = vec2(float(dx), float(dy)) * sampleRadius;
      float l = luma(image.eval(fragCoord + offset));
      sum += l;
      sumSq += l * l;
    }
  }
  float localMean = sum / 25.0;
  float variance = max(sumSq / 25.0 - localMean * localMean, 0.0);
  float localStdDev = sqrt(variance);

  float threshold = localMean * (1.0 + k * (localStdDev / r - 1.0));
  float isBackground = step(threshold, centerLuma);
  return vec4(isBackground, isBackground, isBackground, 1.0);
}
`;

const SAUVOLA_K = 0.2; // matches scikit-image's threshold_sauvola default
const SAUVOLA_R = 0.5; // half the normalized 0..1 dynamic range, per Sauvola's standard parameterization
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

// Real pixel-level bake using Skia — runs the page through an offscreen GPU surface. auto/color/
// gray/bw derive a content-adaptive matrix from a real histogram analysis of the page (see
// analyzeImage/baseModeFilter above), so every mode now produces a genuinely distinct result
// instead of some being no-ops; document_scan runs the Sauvola threshold shader instead, since a
// binarized scan has no continuous tone for a color matrix to act on. Manual brightness/contrast/
// saturation adjustments are composed on TOP of the mode filter (not before it) - the mode
// filter's stats are computed from the original pixels, so it must see the original distribution;
// the user's adjustment then applies as a relative nudge on top of that already-corrected result.
// Always writes a new JPEG file; never touches the source page's original image.
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
      [SAUVOLA_K, SAUVOLA_R, SAMPLE_RADIUS_RATIO * Math.max(width, height)],
      [imageShader]
    );
    paint.setShader(shader);
    canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
  } else {
    const stats = analyzeImage(image);
    const modeFilter = baseModeFilter(mode, stats);
    const adjustFilter = composeAdjustFilter(adjust);
    const colorFilter = adjustFilter ? Skia.ColorFilter.MakeCompose(adjustFilter, modeFilter) : modeFilter;
    paint.setColorFilter(colorFilter);
    canvas.drawImage(image, 0, 0, paint);
  }
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 92);

  const dest = new File(Paths.cache, `${createId('enhanced')}.jpg`);
  dest.write(bytes);

  return { uri: dest.uri, width, height };
}
