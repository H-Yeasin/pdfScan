import { File, FileMode } from 'expo-file-system';
import { ZipReader, type ZipEntry } from './zipReader';
import { ZipWriter, type AddFileOptions } from './zipWriter';
import type { ZipLimits } from './zipFormat';

// §8 B2: the zip code on real files. zipWriter/zipReader only see file handles, so tests can
// hand them in-memory ones; this is where expo-file-system's File.open() comes in.

export { ZipReader, type ZipEntry } from './zipReader';
export { ZipWriter, ZipAbortedError } from './zipWriter';
export { ZipError, type ZipErrorCode } from './zipFormat';

// Starts a new zip at `dest`, replacing any file there. The destination must be a file:// path
// (seekable; see zipWriter).
export function createZip(dest: File, options: { limits?: ZipLimits; modified?: Date } = {}): ZipWriter {
  if (dest.exists) dest.delete();
  dest.create({ intermediates: true });
  return new ZipWriter(dest.open(FileMode.ReadWrite), options);
}

export async function addFileFromDisk(writer: ZipWriter, name: string, source: File, options?: AddFileOptions): Promise<void> {
  const handle = source.open(FileMode.ReadOnly);
  try {
    await writer.addFile(name, handle, options);
  } finally {
    handle.close();
  }
}

export function openZip(file: File): ZipReader {
  return ZipReader.open(file.open(FileMode.ReadOnly));
}

// Extracts one entry to `dest` (parent folders created). On any failure - a CRC mismatch, a
// cancel - the partial file is deleted before the error is passed on.
export async function extractToFile(
  reader: ZipReader,
  entry: ZipEntry,
  dest: File,
  options?: { signal?: AbortSignal; onProgress?: (bytesCopied: number) => void }
): Promise<void> {
  if (dest.exists) dest.delete();
  dest.create({ intermediates: true });
  const handle = dest.open(FileMode.ReadWrite);
  try {
    await reader.extract(entry, handle, options);
    handle.close();
  } catch (error) {
    handle.close();
    if (dest.exists) dest.delete();
    throw error;
  }
}
