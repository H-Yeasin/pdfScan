import { AlphaType, ColorType, FilterMode, MipmapMode, Skia } from '@shopify/react-native-skia';
import { detectQuadInLuma, type QuadDetection } from './quadDetect';
import { scaleQuad } from './quadGeometry';

const DETECT_MAX_DIM = 400;

// Finds the document's four corners in a (master) image, in that image's pixel coordinates.
// Pixel reading is Skia; the detection itself is pure (quadDetect.ts). Never throws for a
// photo it can't read - that's just "no page found".
export async function detectDocumentQuad(uri: string): Promise<QuadDetection | null> {
  try {
    const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
    if (!image) return null;
    const srcW = image.width();
    const srcH = image.height();
    const scale = Math.min(1, DETECT_MAX_DIM / Math.max(srcW, srcH));
    const width = Math.max(8, Math.round(srcW * scale));
    const height = Math.max(8, Math.round(srcH * scale));

    const surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) return null;
    surface
      .getCanvas()
      .drawImageRectOptions(
        image,
        Skia.XYWHRect(0, 0, srcW, srcH),
        Skia.XYWHRect(0, 0, width, height),
        FilterMode.Linear,
        MipmapMode.Linear
      );
    surface.flush();
    const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    }) as Uint8Array | null;
    if (!pixels) return null;

    const luma = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
      luma[i] = Math.round(0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]);
    }
    const found = detectQuadInLuma(luma, width, height);
    return found ? { ...found, quad: scaleQuad(found.quad, srcW / width, srcH / height) } : null;
  } catch (error) {
    console.warn('detectDocumentQuad failed', error);
    return null;
  }
}
