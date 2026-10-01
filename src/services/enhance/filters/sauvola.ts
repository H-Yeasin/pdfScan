import { FilterMode, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import type { SkImage, SkShader } from '@shopify/react-native-skia';

// --- B&W: Sauvola local-adaptive binarization -------------------------------------------------
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
const SAUVOLA_SKSL = `
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

export const SAUVOLA_K = 0.2; // matches scikit-image's threshold_sauvola default
export const SAUVOLA_R = 0.5; // half the normalized 0..1 dynamic range, per Sauvola's standard parameterization
export const SAMPLE_RADIUS_RATIO = 0.006; // tap spacing as a fraction of the longer image dimension

export type SauvolaParams = { k: number; r: number; radiusRatio: number };
const DEFAULT_SAUVOLA: SauvolaParams = { k: SAUVOLA_K, r: SAUVOLA_R, radiusRatio: SAMPLE_RADIUS_RATIO };

// Compiled once and cached at module scope so the shader isn't recompiled on every page.
let sauvolaEffect: ReturnType<typeof Skia.RuntimeEffect.Make> | null = null;
function getSauvolaEffect() {
  if (!sauvolaEffect) {
    sauvolaEffect = Skia.RuntimeEffect.Make(SAUVOLA_SKSL);
    if (!sauvolaEffect) throw new Error('Skia failed to compile the Sauvola B&W shader');
  }
  return sauvolaEffect;
}

// The shader works in the image's own pixel space (0..width, 0..height); drawFiltered maps that
// space onto the target rect, so the tap spacing stays relative to the source resolution.
export function makeSauvolaShader(
  image: SkImage,
  width: number,
  height: number,
  { k, r, radiusRatio }: SauvolaParams = DEFAULT_SAUVOLA
): SkShader {
  const imageShader = image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
  return getSauvolaEffect().makeShaderWithChildren(
    [k, r, radiusRatio * Math.max(width, height)],
    [imageShader]
  );
}
