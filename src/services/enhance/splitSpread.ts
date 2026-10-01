import { File, Paths } from 'expo-file-system';
import { AlphaType, ColorType, FilterMode, ImageFormat, MipmapMode, Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';
import { MASTER_JPEG_Q } from '../capture/imageSpec';
import { findGutter, isSpread } from './gutter';

const MEASURE_WIDTH = 256;
// Rows near the top and bottom are often the desk or the page edge curling - measure only the
// middle band so they don't wash out the binding shadow.
const MEASURE_ROW_START = 0.15;
const MEASURE_ROW_END = 0.85;

export type SpreadHalf = { uri: string; width: number; height: number };

// Average brightness (0..255 luma) of each column of a ~256 px wide copy of the image.
function measureColumns(image: SkImage): number[] {
  const width = MEASURE_WIDTH;
  const height = Math.max(8, Math.round((image.height() / image.width()) * width));
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('splitSpread: Skia failed to create the measuring surface');
  surface
    .getCanvas()
    .drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
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
  if (!pixels) throw new Error('splitSpread: Skia failed to read back pixels');

  const rowStart = Math.floor(height * MEASURE_ROW_START);
  const rowEnd = Math.ceil(height * MEASURE_ROW_END);
  const columns = new Array<number>(width).fill(0);
  for (let y = rowStart; y < rowEnd; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      columns[x] += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }
  }
  const rows = rowEnd - rowStart;
  return columns.map((sum) => sum / rows);
}

// One crop of the master, one encode (the same single-pass pattern as renderPage).
function cropHalf(image: SkImage, x: number, width: number): SpreadHalf {
  const height = image.height();
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('splitSpread: Skia failed to create an offscreen surface');
  surface
    .getCanvas()
    .drawImageRectOptions(
      image,
      Skia.XYWHRect(x, 0, width, height),
      Skia.XYWHRect(0, 0, width, height),
      FilterMode.Linear,
      MipmapMode.None
    );
  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, Math.round(MASTER_JPEG_Q * 100));
  const dest = new File(Paths.cache, `${createId('half')}.jpg`);
  dest.write(bytes);
  return { uri: dest.uri, width, height };
}

// Splits a two-page book spread at the binding into [left, right] new files. Returns null (and
// writes nothing) for a portrait/square image, which is a single page. Never touches `uri`.
export async function splitSpread(uri: string): Promise<[SpreadHalf, SpreadHalf] | null> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`splitSpread: failed to decode image at ${uri}`);
  const width = image.width();
  if (!isSpread(width, image.height())) return null;

  const { position } = findGutter(measureColumns(image));
  const splitX = Math.min(width - 1, Math.max(1, Math.round(position * width)));
  return [cropHalf(image, 0, splitX), cropHalf(image, splitX, width - splitX)];
}
