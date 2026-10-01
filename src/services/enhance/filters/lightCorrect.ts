import { FilterMode, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import type { SkImage, SkShader } from '@shopify/react-native-skia';
import { correctionTarget, LIGHT_FLOOR, PAPER_WHITE } from './lightCorrectMath';
import type { LightStats } from './lightCorrectMath';

// --- Shadow and lighting correction (flat-field) ---------------------------------------------
//
// See lightCorrectMath.ts for the idea. The background is estimated on a small copy whose long
// side is always BG_LONG_SIDE pixels, so the morphology radius and blur sigma below are fractions
// of the page, not pixel counts: the 1400 px preview and the full-size export get the same
// background, which keeps the preview matching the export.

const BG_LONG_SIDE = 160; // about 1/8 of a 1200 px scan
export const LIGHT_RADIUS = 3; // max/min filter radius at BG_LONG_SIDE: wider than a pen stroke (~2% of the page)
export const LIGHT_SIGMA = 6; // Gaussian sigma at BG_LONG_SIDE, smooths the blocky morphology output
export { PAPER_WHITE };

export type LightCorrectParams = { radius: number; sigma: number; paperWhite: number };
export const DEFAULT_LIGHT_PARAMS: LightCorrectParams = { radius: LIGHT_RADIUS, sigma: LIGHT_SIGMA, paperWhite: PAPER_WHITE };

const LIGHT_CORRECT_SKSL = `
uniform shader image;
uniform shader background;
uniform float3 target;
uniform float floorValue;

half4 main(float2 p) {
  half4 src = image.eval(p);
  half3 bg = background.eval(p).rgb;
  half3 corrected = clamp(src.rgb / max(bg, half3(floorValue)) * half3(target), 0.0, 1.0);
  return half4(corrected, src.a);
}
`;

let lightCorrectEffect: ReturnType<typeof Skia.RuntimeEffect.Make> | null = null;
function getLightCorrectEffect() {
  if (!lightCorrectEffect) {
    lightCorrectEffect = Skia.RuntimeEffect.Make(LIGHT_CORRECT_SKSL);
    if (!lightCorrectEffect) throw new Error('Skia failed to compile the light-correction shader');
  }
  return lightCorrectEffect;
}

// Keyed by the decoded image object, so the preview re-recording on every slider tick reuses one
// background instead of re-running the morphology. Entries go away with their image.
const backgroundCache = new WeakMap<SkImage, Map<string, SkImage>>();

// The estimated light falling on the page, as a small image (long side BG_LONG_SIDE).
export function makeBackgroundImage(image: SkImage, dark: boolean, radius = LIGHT_RADIUS, sigma = LIGHT_SIGMA): SkImage {
  const key = `${dark ? 'erode' : 'dilate'}|${radius}|${sigma}`;
  let perImage = backgroundCache.get(image);
  const hit = perImage?.get(key);
  if (hit) return hit;

  const srcW = image.width();
  const srcH = image.height();
  const scale = BG_LONG_SIDE / Math.max(srcW, srcH);
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const smallSurface = Skia.Surface.MakeOffscreen(width, height);
  if (!smallSurface) throw new Error('Skia failed to create the light-correction surface');
  smallSurface
    .getCanvas()
    .drawImageRectOptions(image, Skia.XYWHRect(0, 0, srcW, srcH), Skia.XYWHRect(0, 0, width, height), FilterMode.Linear, MipmapMode.Linear);
  smallSurface.flush();
  const smallSnapshot = smallSurface.makeImageSnapshot();
  const small = smallSnapshot.makeNonTextureImage() ?? smallSnapshot;

  // The morphology reads its input through a clamp-tiled shader, so pixels past the page edge
  // repeat the edge instead of being transparent black (which an erode would spread inward as a
  // dark frame, and a blur would pull down at the borders).
  const input = Skia.ImageFilter.MakeShader(small.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None));
  const morph = dark ? Skia.ImageFilter.MakeErode(radius, radius, input) : Skia.ImageFilter.MakeDilate(radius, radius, input);
  const blurred = Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, morph);

  const bgSurface = Skia.Surface.MakeOffscreen(width, height);
  if (!bgSurface) throw new Error('Skia failed to create the light-correction surface');
  const paint = Skia.Paint();
  paint.setImageFilter(blurred);
  bgSurface.getCanvas().drawPaint(paint);
  bgSurface.flush();
  // CPU-backed, so the same background works in an offscreen export and an on-screen <Canvas>.
  const snapshot = bgSurface.makeImageSnapshot();
  const background = snapshot.makeNonTextureImage() ?? snapshot;

  if (!perImage) {
    perImage = new Map();
    backgroundCache.set(image, perImage);
  }
  perImage.set(key, background);
  return background;
}

// The page with its lighting divided out, as a shader in the image's own pixel space (0..width,
// 0..height). Filters with lightCorrect: true read this instead of the raw image.
export function makeLightCorrectedShader(
  image: SkImage,
  width: number,
  height: number,
  light: LightStats | undefined,
  params: LightCorrectParams = DEFAULT_LIGHT_PARAMS
): SkShader {
  const background = makeBackgroundImage(image, !!light?.dark, params.radius, params.sigma);
  const toImageSpace = Skia.Matrix().scale(width / background.width(), height / background.height());
  const imageShader = image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.Linear);
  const backgroundShader = background.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None, toImageSpace);
  return getLightCorrectEffect().makeShaderWithChildren(
    [...correctionTarget(light, params.paperWhite), LIGHT_FLOOR],
    [imageShader, backgroundShader]
  );
}
