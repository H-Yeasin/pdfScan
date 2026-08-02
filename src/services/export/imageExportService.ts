import { File } from 'expo-file-system';
import { compressPage } from '../enhance/enhanceService';
import { getDocumentDir } from '../persistence/libraryFiles';

export type ExportSourcePage = { uri: string };

export async function saveImagesToLibrary(
  documentId: string,
  pages: ExportSourcePage[],
  quality: number,
  courseFolder?: string
): Promise<{ uris: string[]; sizeBytes: number }> {
  const dir = getDocumentDir(documentId, courseFolder);
  const compressQuality = 0.2 + (quality - 1) * 0.2; // quality 1-5 -> 0.2-1.0

  const uris: string[] = [];
  let sizeBytes = 0;

  for (let i = 0; i < pages.length; i++) {
    const compressed = await compressPage(pages[i].uri, compressQuality);
    const dest = new File(dir, `page_${i + 1}.jpg`);
    if (dest.exists) dest.delete();
    new File(compressed.uri).move(dest);
    uris.push(dest.uri);
    sizeBytes += dest.size ?? 0;
  }

  return { uris, sizeBytes };
}
