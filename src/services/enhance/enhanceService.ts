import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

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
