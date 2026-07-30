import { File, Paths } from 'expo-file-system';
import { FilterMode, ImageFormat, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';

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

// Real pixel-level bake using Skia — runs the page through an offscreen GPU surface. gray/bw use
// a color matrix (grayscale, plus a contrast push for bw); document_scan runs a local-adaptive
// threshold RuntimeEffect shader instead, to strip shadows a global matrix can't tell from ink.
// Always writes a new JPEG file; never touches the source page's original image.
export async function bakeEnhance(
  uri: string,
  mode: BakeableEnhance
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
    const grayscaleFilter = Skia.ColorFilter.MakeMatrix(GRAYSCALE_MATRIX);
    const colorFilter =
      mode === 'bw' ? Skia.ColorFilter.MakeCompose(Skia.ColorFilter.MakeMatrix(contrastMatrix(2.1)), grayscaleFilter) : grayscaleFilter;
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
