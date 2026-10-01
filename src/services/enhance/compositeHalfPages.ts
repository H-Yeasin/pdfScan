import { File, Paths } from 'expo-file-system';
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';
import { fitBox } from '../../utils/fitBox';
import { MASTER_JPEG_Q, MASTER_MAX_DIM } from '../capture/imageSpec';

// A4-ratio pixel canvas for a merged (two-pages-stacked) page, at the same long-side budget as
// any other master (about 1697x2400), so a merged page is as sharp as a normal one.
const MERGE_CANVAS_HEIGHT_PX = MASTER_MAX_DIM;
const MERGE_CANVAS_WIDTH_PX = Math.round(MASTER_MAX_DIM / Math.SQRT2);
const JPEG_QUALITY = Math.round(MASTER_JPEG_Q * 100);

type CroppedImage = { uri: string; width: number; height: number };

// Composites two already-cropped page images onto one new A4-ratio page, `first` fit into the top
// half and `second` into the bottom half (uniformly scaled, centered, never stretched or cropped
// further - see fitBox), on a white background, no gap between halves. Named to avoid colliding
// with the app's other, unrelated "merge" features (libraryOperations.ts's mergeDocuments, whole-
// document concatenation; Library's SelectionToolId 'merge') - this is a pairwise, half-page
// composite, a different operation from either of those.
export async function compositeHalfPages(first: CroppedImage, second: CroppedImage): Promise<CroppedImage> {
  const firstData = await Skia.Data.fromURI(first.uri);
  const firstImage = Skia.Image.MakeImageFromEncoded(firstData);
  if (!firstImage) throw new Error(`compositeHalfPages: failed to decode image at ${first.uri}`);

  const secondData = await Skia.Data.fromURI(second.uri);
  const secondImage = Skia.Image.MakeImageFromEncoded(secondData);
  if (!secondImage) throw new Error(`compositeHalfPages: failed to decode image at ${second.uri}`);

  const surface = Skia.Surface.MakeOffscreen(MERGE_CANVAS_WIDTH_PX, MERGE_CANVAS_HEIGHT_PX);
  if (!surface) throw new Error('compositeHalfPages: Skia failed to create an offscreen surface');
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color('#ffffff'));

  const halfHeight = MERGE_CANVAS_HEIGHT_PX / 2;
  const paint = Skia.Paint();

  const topFit = fitBox(first.width, first.height, 0, 0, MERGE_CANVAS_WIDTH_PX, halfHeight);
  canvas.drawImageRect(
    firstImage,
    Skia.XYWHRect(0, 0, first.width, first.height),
    Skia.XYWHRect(topFit.origin.x, topFit.origin.y, topFit.width, topFit.height),
    paint
  );

  const bottomFit = fitBox(second.width, second.height, 0, halfHeight, MERGE_CANVAS_WIDTH_PX, halfHeight);
  canvas.drawImageRect(
    secondImage,
    Skia.XYWHRect(0, 0, second.width, second.height),
    Skia.XYWHRect(bottomFit.origin.x, bottomFit.origin.y, bottomFit.width, bottomFit.height),
    paint
  );

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, JPEG_QUALITY);
  const dest = new File(Paths.cache, `${createId('merged')}.jpg`);
  dest.write(bytes);

  return { uri: dest.uri, width: MERGE_CANVAS_WIDTH_PX, height: MERGE_CANVAS_HEIGHT_PX };
}
