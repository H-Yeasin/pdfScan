import { AlphaType, ColorType, FilterMode, MipmapMode, Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { channelStatsFromHistogram, LUMA_B, LUMA_G, LUMA_R } from './filterMath';
import { makeBackgroundImage } from './lightCorrect';
import { INK_PERCENTILE, percentileFromHistogram } from './inkMath';
import { correctionTarget, DARK_PAGE_MEDIAN, divideByBackground, medianFromHistogram } from './lightCorrectMath';
import type { LightStats } from './lightCorrectMath';
import type { ImageStats } from '../../../types/models';

// --- Content-adaptive analysis (Auto/Color/Gray) ---------------------------------------------
//
// auto/color/gray all derive their per-image "look" from a real histogram analysis of the page,
// rather than a fixed matrix - this is what makes them actually distinct from each other. A small
// downscaled copy of the page is drawn and read back once; everything downstream is plain
// per-channel arithmetic on a 2304-pixel buffer (filterMath.ts). The result is cached on
// SessionPage.stats, so switching filters or moving a slider never repeats this read-back.
//
// Those filters all run light correction first (lightCorrect.ts), so their levels must be
// measured on the CORRECTED page: a shadow would otherwise pin the black point at the shadowed
// paper. The raw histogram is still used for one thing - deciding whether the page is dark.

const ANALYSIS_SIZE = 48;
// The Ink knees need the ink's own luma, and at 48x48 a pen stroke is averaged into the paper
// around it. At 512 a 2-3 px stroke on a 1200 px scan still mostly survives. Square on purpose:
// only the histogram matters, not the aspect ratio.
const TONE_ANALYSIS_SIZE = 512;

function readSmall(image: SkImage, size = ANALYSIS_SIZE): Uint8Array {
  const surface = Skia.Surface.MakeOffscreen(size, size);
  if (!surface) throw new Error('Skia failed to create the analysis offscreen surface');
  surface
    .getCanvas()
    .drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, size, size),
      FilterMode.Linear,
      MipmapMode.Linear
    );
  surface.flush();
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: size,
    height: size,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  }) as Uint8Array | null;
  if (!pixels) throw new Error('Skia failed to read back analysis pixels');
  return pixels;
}

const lumaOf = (r: number, g: number, b: number) => Math.round(LUMA_R * r + LUMA_G * g + LUMA_B * b);

// Downscales the page (and its estimated background) to ANALYSIS_SIZE, divides one by the other
// in JS with the same formula as the GPU shader, and builds per-channel and luminance histograms
// of the result. Cheap and fixed-cost regardless of source resolution.
export function analyzeImage(image: SkImage): ImageStats {
  const pixels = readSmall(image);
  const total = ANALYSIS_SIZE * ANALYSIS_SIZE;

  const rawLuma = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) rawLuma[lumaOf(pixels[i], pixels[i + 1], pixels[i + 2])]++;
  const dark = medianFromHistogram(rawLuma, total) < DARK_PAGE_MEDIAN;

  const background = makeBackgroundImage(image, dark);
  const bgPixels = readSmall(background);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < bgPixels.length; i += 4) {
    sumR += bgPixels[i];
    sumG += bgPixels[i + 1];
    sumB += bgPixels[i + 2];
  }
  const light: LightStats = { dark, bgMean: [sumR / total / 255, sumG / total / 255, sumB / total / 255] };
  const [tr, tg, tb] = correctionTarget(light);

  const rCounts = new Uint32Array(256);
  const gCounts = new Uint32Array(256);
  const bCounts = new Uint32Array(256);
  const lumaCounts = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = Math.round(divideByBackground(pixels[i] / 255, bgPixels[i] / 255, tr) * 255);
    const g = Math.round(divideByBackground(pixels[i + 1] / 255, bgPixels[i + 1] / 255, tg) * 255);
    const b = Math.round(divideByBackground(pixels[i + 2] / 255, bgPixels[i + 2] / 255, tb) * 255);
    rCounts[r]++;
    gCounts[g]++;
    bCounts[b]++;
    lumaCounts[lumaOf(r, g, b)]++;
  }

  return {
    r: channelStatsFromHistogram(rCounts, total),
    g: channelStatsFromHistogram(gCounts, total),
    b: channelStatsFromHistogram(bCounts, total),
    luma: channelStatsFromHistogram(lumaCounts, total),
    light,
    tone: analyzeTone(image, background, [tr, tg, tb]),
  };
}

// Paper and ink luma of the corrected page at TONE_ANALYSIS_SIZE, for the Ink filter's knees
// (inkMath.inkKnees). Same divide as above; luma only.
function analyzeTone(image: SkImage, background: SkImage, target: [number, number, number]): { paper: number; ink: number } {
  const pixels = readSmall(image, TONE_ANALYSIS_SIZE);
  const bgPixels = readSmall(background, TONE_ANALYSIS_SIZE);
  const counts = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = divideByBackground(pixels[i] / 255, bgPixels[i] / 255, target[0]);
    const g = divideByBackground(pixels[i + 1] / 255, bgPixels[i + 1] / 255, target[1]);
    const b = divideByBackground(pixels[i + 2] / 255, bgPixels[i + 2] / 255, target[2]);
    counts[Math.round((LUMA_R * r + LUMA_G * g + LUMA_B * b) * 255)]++;
  }
  const total = TONE_ANALYSIS_SIZE * TONE_ANALYSIS_SIZE;
  return { paper: medianFromHistogram(counts, total), ink: percentileFromHistogram(counts, total, INK_PERCENTILE) };
}

// Decode + analyze for callers that only hold a file URI (page ingest). Best-effort like OCR: a
// failure returns undefined and the stats are simply measured later at render time instead.
export async function analyzeImageUri(uri: string): Promise<ImageStats | undefined> {
  try {
    const data = await Skia.Data.fromURI(uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) return undefined;
    return analyzeImage(image);
  } catch {
    return undefined;
  }
}
