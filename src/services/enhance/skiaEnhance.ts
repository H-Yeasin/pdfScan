import { File, Paths } from 'expo-file-system';
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';

const GRAYSCALE_MATRIX = [
  0.299, 0.587, 0.114, 0, 0,
  0.299, 0.587, 0.114, 0, 0,
  0.299, 0.587, 0.114, 0, 0,
  0, 0, 0, 1, 0,
];

function contrastMatrix(contrast: number) {
  const t = ((1 - contrast) / 2) * 255;
  return [
    contrast, 0, 0, 0, t,
    0, contrast, 0, 0, t,
    0, 0, contrast, 0, t,
    0, 0, 0, 1, 0,
  ];
}

export type BakeableEnhance = 'gray' | 'bw';

// Real pixel-level bake using Skia — runs the page through an offscreen GPU surface with a
// grayscale (and, for B&W, an added contrast push) color matrix, then encodes the result to a
// new JPEG file. Always writes a new file; never touches the source page's original image.
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

  const grayscaleFilter = Skia.ColorFilter.MakeMatrix(GRAYSCALE_MATRIX);
  const colorFilter =
    mode === 'bw' ? Skia.ColorFilter.MakeCompose(Skia.ColorFilter.MakeMatrix(contrastMatrix(2.1)), grayscaleFilter) : grayscaleFilter;

  const paint = Skia.Paint();
  paint.setColorFilter(colorFilter);

  const canvas = surface.getCanvas();
  canvas.drawImage(image, 0, 0, paint);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 92);

  const dest = new File(Paths.cache, `${createId('enhanced')}.jpg`);
  dest.write(bytes);

  return { uri: dest.uri, width, height };
}
