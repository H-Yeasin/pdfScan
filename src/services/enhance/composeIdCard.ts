import { File, Paths } from 'expo-file-system';
import { FilterMode, ImageFormat, MipmapMode, Skia } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';
import type { IdCardSize } from '../../types/models';
import { MASTER_JPEG_Q } from '../capture/imageSpec';
import { ID_CANVAS_HEIGHT, ID_CANVAS_WIDTH, idCardPlacements } from './idCardLayout';

export type CardImage = { uri: string; width: number; height: number };

async function decode(uri: string) {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new Error(`composeIdCard: failed to decode image at ${uri}`);
  return image;
}

// Composes an ID card's front (and back, if scanned) onto one white A4 page, at true size or
// enlarged (`size`) - see idCardLayout.ts - in one Skia pass and one encode. Never touches the source images, which the
// session page keeps (SessionPage.idCard) for "Swap front/back" / "Retake back".
export async function composeIdCard(front: CardImage, back?: CardImage, size?: IdCardSize): Promise<CardImage> {
  const surface = Skia.Surface.MakeOffscreen(ID_CANVAS_WIDTH, ID_CANVAS_HEIGHT);
  if (!surface) throw new Error('composeIdCard: Skia failed to create an offscreen surface');
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color('#ffffff'));

  const placements = idCardPlacements(front, back, size);
  const draw = async (card: CardImage, at: { origin: { x: number; y: number }; width: number; height: number }) => {
    const image = await decode(card.uri);
    canvas.drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(at.origin.x, at.origin.y, at.width, at.height),
      FilterMode.Linear,
      MipmapMode.Linear
    );
  };
  await draw(front, placements.front);
  if (back && placements.back) await draw(back, placements.back);
  surface.flush();

  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, Math.round(MASTER_JPEG_Q * 100));
  const dest = new File(Paths.cache, `${createId('idcard')}.jpg`);
  dest.write(bytes);
  return { uri: dest.uri, width: ID_CANVAS_WIDTH, height: ID_CANVAS_HEIGHT };
}
