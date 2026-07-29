import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

export type ManipulatedImage = { uri: string; width: number; height: number };

export async function rotatePage(uri: string, degrees: number): Promise<ManipulatedImage> {
  return manipulateAsync(uri, [{ rotate: degrees }], { compress: 1, format: SaveFormat.JPEG });
}

export async function cropPage(
  uri: string,
  cropRect: { originX: number; originY: number; width: number; height: number }
): Promise<ManipulatedImage> {
  return manipulateAsync(uri, [{ crop: cropRect }], { compress: 1, format: SaveFormat.JPEG });
}

export async function compressPage(uri: string, quality: number): Promise<ManipulatedImage> {
  return manipulateAsync(uri, [], { compress: quality, format: SaveFormat.JPEG });
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

// Caps the longer side at `maxDimension` while preserving aspect ratio. Passing both width
// and height to a single resize action stretches the image to that exact box instead of
// preserving ratio, so the source dimensions are probed first and only one axis is constrained.
export async function downscaleAndCompressPage(
  uri: string,
  maxDimension: number,
  quality: number
): Promise<ManipulatedImage> {
  const { width, height } = await getImageSize(uri);
  const actions =
    Math.max(width, height) > maxDimension
      ? [{ resize: width >= height ? { width: maxDimension } : { height: maxDimension } }]
      : [];
  return manipulateAsync(uri, actions, { compress: quality, format: SaveFormat.JPEG });
}
