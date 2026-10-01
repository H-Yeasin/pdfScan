import { File, Paths } from 'expo-file-system';
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { fitWithin } from '../capture/imageSpec';
import { createId } from '../../utils/id';
import { drawFiltered, drawRotated, rotatedSize } from './filters/drawFiltered';
import type { FilterPage } from './filters/drawFiltered';
import type { SessionPage } from '../../types/models';

// All filter logic lives in ./filters (registry.ts lists them; drawFiltered.ts applies them).
// This file is only the export-side wrapper: decode, rotate + fit + draw through drawFiltered into
// an offscreen surface, encode once.

export type PageEdits = Partial<FilterPage> & {
  rotation?: SessionPage['rotation'];
};

export type RenderTarget = { maxDim: number; q: number };

export type RenderedPage = { uri: string; width: number; height: number };

// Renders a page in ONE Skia pass - rotate, filter, downscale - and encodes it exactly once, to a
// new JPEG in the cache dir. This is the only place page pixels are re-encoded on the way to the
// library or an export, so quality never compounds across steps. Never touches the source file.
// No `enhance` means no filter ('original'): a plain resize/re-encode, e.g. exporting a master.
export async function renderPage(uri: string, edits: PageEdits, target: RenderTarget): Promise<RenderedPage> {
  const { bytes, width, height } = await renderToBytes(uri, edits, target);
  const dest = new File(Paths.cache, `${createId('render')}.jpg`);
  dest.write(bytes);
  return { uri: dest.uri, width, height };
}

// The JPEG size renderPage would write, without writing it: the size target samples a few pages
// at several levels (services/submit/sizeTarget.ts) and only needs the byte count.
export async function encodedBytes(uri: string, edits: PageEdits, target: RenderTarget): Promise<number> {
  return (await renderToBytes(uri, edits, target)).bytes.length;
}

async function renderToBytes(uri: string, edits: PageEdits, target: RenderTarget) {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`Skia failed to decode image at ${uri}`);

  const srcWidth = image.width();
  const srcHeight = image.height();
  const rotation = edits.rotation ?? 0;
  const rotated = rotatedSize(srcWidth, srcHeight, rotation);
  const out = fitWithin(rotated.width, rotated.height, target.maxDim);

  const surface = Skia.Surface.MakeOffscreen(out.width, out.height);
  if (!surface) throw new Error('Skia failed to create an offscreen surface');
  const canvas = surface.getCanvas();

  // Drawn in source coordinates, so shader-based filters keep their sample radii in source pixels.
  const page: FilterPage = {
    enhance: edits.enhance ?? 'original',
    adjust: edits.adjust,
    stats: edits.stats,
    filterOptions: edits.filterOptions,
  };
  drawRotated(canvas, srcWidth, srcHeight, rotation, out, (srcRect) => drawFiltered(canvas, image, page, srcRect));
  surface.flush();

  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, Math.round(target.q * 100));
  return { bytes, width: out.width, height: out.height };
}
