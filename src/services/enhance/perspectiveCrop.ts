import { File, Paths } from 'expo-file-system';
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';
import { quadToQuadMatrix, type Point } from './perspective';

const JPEG_QUALITY = 92;

function edgeLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Warps the quadrilateral `points` (topLeft/topRight/bottomRight/bottomLeft, in the source
// image's natural pixel space) into an upright rectangle — the same offscreen-Skia-surface
// pattern as bakeEnhance in skiaEnhance.ts, but concatenating a projective (not affine) matrix
// so a skewed quad is corrected into a true rectangle rather than just its bounding box. Output
// size is derived from the quad's own edge lengths (the longer of its two horizontal/vertical
// edges) so the result never upscales past the source resolution.
export async function warpPerspectiveCrop(
  uri: string,
  points: [Point, Point, Point, Point]
): Promise<{ uri: string; width: number; height: number }> {
  const [topLeft, topRight, bottomRight, bottomLeft] = points;

  const outputWidth = Math.max(
    1,
    Math.round(Math.max(edgeLength(topLeft, topRight), edgeLength(bottomLeft, bottomRight)))
  );
  const outputHeight = Math.max(
    1,
    Math.round(Math.max(edgeLength(topLeft, bottomLeft), edgeLength(topRight, bottomRight)))
  );

  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`Skia failed to decode image at ${uri}`);

  const surface = Skia.Surface.MakeOffscreen(outputWidth, outputHeight);
  if (!surface) throw new Error('Skia failed to create an offscreen surface');

  const matrix = quadToQuadMatrix(points, [
    { x: 0, y: 0 },
    { x: outputWidth, y: 0 },
    { x: outputWidth, y: outputHeight },
    { x: 0, y: outputHeight },
  ]);

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.concat(matrix);
  canvas.drawImage(image, 0, 0, paint);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, JPEG_QUALITY);

  const dest = new File(Paths.cache, `${createId('cropped')}.jpg`);
  dest.write(bytes);

  return { uri: dest.uri, width: outputWidth, height: outputHeight };
}
