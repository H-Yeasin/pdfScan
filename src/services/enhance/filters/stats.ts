import { AlphaType, ColorType, FilterMode, MipmapMode, Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { channelStatsFromHistogram, LUMA_B, LUMA_G, LUMA_R } from './filterMath';
import type { ImageStats } from '../../../types/models';

// --- Content-adaptive analysis (Auto/Color/Gray) ---------------------------------------------
//
// auto/color/gray all derive their per-image "look" from a real histogram analysis of the page,
// rather than a fixed matrix - this is what makes them actually distinct from each other. A small
// downscaled copy of the page is drawn and read back once; everything downstream is plain
// per-channel arithmetic on a 2304-pixel buffer (filterMath.ts). The result is cached on
// SessionPage.stats, so switching filters or moving a slider never repeats this read-back.

const ANALYSIS_SIZE = 48;

// Downscales the page to ANALYSIS_SIZE and reads back real pixels to build per-channel and
// luminance histograms. Cheap and fixed-cost regardless of source resolution (one small draw +
// a 2304-pixel loop).
export function analyzeImage(image: SkImage): ImageStats {
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
    lumaCounts[Math.round(LUMA_R * r + LUMA_G * g + LUMA_B * b)]++;
  }

  return {
    r: channelStatsFromHistogram(rCounts, total),
    g: channelStatsFromHistogram(gCounts, total),
    b: channelStatsFromHistogram(bCounts, total),
    luma: channelStatsFromHistogram(lumaCounts, total),
  };
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
