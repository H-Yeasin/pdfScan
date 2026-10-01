import { File, Paths } from 'expo-file-system';
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';
import { drawFiltered } from './filters/drawFiltered';
import type { FilterPage } from './filters/drawFiltered';

// All filter logic lives in ./filters (registry.ts lists them; drawFiltered.ts applies them).
// This file is only the export-side wrapper: decode, draw through drawFiltered into a full-size
// offscreen surface, encode. F5 replaces it with `renderPage`.

// Real pixel-level bake using Skia: runs the page through an offscreen GPU surface. Always writes
// a new JPEG file; never touches the source page's original image.
export async function bakeEnhance(
  uri: string,
  page: FilterPage
): Promise<{ uri: string; width: number; height: number }> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`Skia failed to decode image at ${uri}`);

  const width = image.width();
  const height = image.height();

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('Skia failed to create an offscreen surface');

  drawFiltered(surface.getCanvas(), image, page, Skia.XYWHRect(0, 0, width, height));
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 92);

  const dest = new File(Paths.cache, `${createId('enhanced')}.jpg`);
  dest.write(bytes);

  return { uri: dest.uri, width, height };
}
