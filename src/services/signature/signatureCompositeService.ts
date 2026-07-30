import { File, Paths } from 'expo-file-system';
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { createId } from '../../utils/id';

// Burns a captured signature PNG onto a plain page image (a SessionPage, pre-save - no PDF, no
// compiled document yet). `placement` is natural pixel space, top-left origin - the same
// convention SessionPage.cropRect and SignaturePlacementOverlay's onConfirm already use, so no
// axis flip is needed here (that flip only exists in pdfService.ts's applySignatureToPdf because
// PDF's own coordinate space is bottom-left-origin; a plain raster image has no such quirk).
// Always writes a new JPEG file; never touches the source page's original image.
export async function applySignatureToPage(
  pageUri: string,
  signatureUri: string,
  placement: { originX: number; originY: number; width: number; height: number }
): Promise<{ uri: string; width: number; height: number }> {
  const pageData = await Skia.Data.fromURI(pageUri);
  const pageImage = Skia.Image.MakeImageFromEncoded(pageData);
  if (!pageImage) throw new Error(`signatureCompositeService: failed to decode page image at ${pageUri}`);

  const sigData = await Skia.Data.fromURI(signatureUri);
  const sigImage = Skia.Image.MakeImageFromEncoded(sigData);
  if (!sigImage) throw new Error(`signatureCompositeService: failed to decode signature image at ${signatureUri}`);

  const width = pageImage.width();
  const height = pageImage.height();

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('signatureCompositeService: Skia failed to create an offscreen surface');
  const canvas = surface.getCanvas();
  canvas.drawImage(pageImage, 0, 0);

  const paint = Skia.Paint();
  canvas.drawImageRect(
    sigImage,
    Skia.XYWHRect(0, 0, sigImage.width(), sigImage.height()),
    Skia.XYWHRect(placement.originX, placement.originY, placement.width, placement.height),
    paint
  );

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 92);
  const dest = new File(Paths.cache, `${createId('signed')}.jpg`);
  dest.write(bytes);

  return { uri: dest.uri, width, height };
}
