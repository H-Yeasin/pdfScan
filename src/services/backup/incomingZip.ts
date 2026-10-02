import { Directory, File, Paths } from 'expo-file-system';

// §8 B4: zips arriving from outside - the document picker, or another app's "Open with" - come
// as content:// URIs that the zip reader can't seek in (only file:// and SAF documents give a
// file handle). Each one is copied into the cache first; the copy is what gets read, and it is
// deleted when the restore is done or dismissed.

export const ZIP_MIME_TYPES = ['application/zip', 'application/x-zip-compressed'] as const;

export function looksLikeZip(nameOrUri: string | undefined | null, mimeType?: string | null): boolean {
  if (mimeType && (ZIP_MIME_TYPES as readonly string[]).includes(mimeType)) return true;
  return !!nameOrUri && /\.zip(?:[?#].*)?$/i.test(decodeURIComponent(nameOrUri));
}

function restoreDir(): Directory {
  return new Directory(Paths.cache, 'restore');
}

export async function stageIncomingZip(uri: string): Promise<File> {
  const dir = restoreDir();
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const dest = new File(dir, 'incoming.zip');
  await new File(uri).copy(dest);
  return dest;
}

export function discardIncomingZip(): void {
  const dir = restoreDir();
  try {
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn('discardIncomingZip: could not delete', error);
  }
}
