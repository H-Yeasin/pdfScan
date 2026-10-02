// Android-only: writes a copy of a saved document into a user-chosen device folder via
// Storage Access Framework. This lives in expo-file-system's *legacy* subpath — the new
// File/Directory API used elsewhere in this codebase has no SAF equivalent. Verified against
// the installed expo-file-system@57.0.1 source (node_modules/expo-file-system/src/legacy):
// StorageAccessFramework.createFileAsync expects a name *without* an extension and Android's
// DocumentFile.createFile appends one from the mimeType, and requestDirectoryPermissionsAsync
// already calls takePersistableUriPermission natively, so the granted tree URI survives restarts
// with no extra JS-side bookkeeping.
import { File, FileMode } from 'expo-file-system';
import { EncodingType, readAsStringAsync, StorageAccessFramework } from 'expo-file-system/legacy';
import { isPageRasterFormat } from '../documents/formatCapabilities';
import { MIME_BY_FORMAT } from '../../utils/docFormat';
import type { LibraryDocument } from '../../types/models';
import { t } from '../../i18n';

export type DeviceExportResult = { ok: number; failed: number };

// SAF exposes no folder-name API — only the tree URI itself (e.g.
// content://.../tree/primary%3ADownload%2FScans). Best-effort decode of the trailing path
// segment for display; falls back to a generic label if the URI shape is ever unexpected.
export function deriveFolderLabel(treeUri: string): string {
  try {
    const decoded = decodeURIComponent(treeUri);
    const afterColon = decoded.split(':').pop() ?? decoded;
    const segments = afterColon.split('/').filter(Boolean);
    return segments[segments.length - 1] || t('library.selectedFolder');
  } catch {
    return t('library.selectedFolder');
  }
}

async function writeFileToTree(
  treeUri: string,
  fileNameWithoutExtension: string,
  mimeType: string,
  sourceUri: string
): Promise<boolean> {
  try {
    const base64 = await readAsStringAsync(sourceUri, { encoding: EncodingType.Base64 });
    const destUri = await StorageAccessFramework.createFileAsync(treeUri, fileNameWithoutExtension, mimeType);
    await StorageAccessFramework.writeAsStringAsync(destUri, base64, { encoding: EncodingType.Base64 });
    return true;
  } catch (error) {
    console.warn('deviceExportService: failed to export', fileNameWithoutExtension, error);
    return false;
  }
}

// Best-effort per file: one failed page shouldn't abort the rest, and never throws — the
// caller folds { ok, failed } into a single snackbar rather than surfacing a hard error.
export async function exportCopyToDeviceFolder(treeUri: string, doc: LibraryDocument): Promise<DeviceExportResult> {
  let ok = 0;
  let failed = 0;

  if (doc.format === 'PDF' && doc.pdfUri) {
    const success = await writeFileToTree(treeUri, doc.name, 'application/pdf', doc.pdfUri);
    if (success) ok++;
    else failed++;
    return { ok, failed };
  }

  if (!isPageRasterFormat(doc.format) && doc.contentUri) {
    const success = await writeFileToTree(treeUri, doc.name, MIME_BY_FORMAT[doc.format], doc.contentUri);
    if (success) ok++;
    else failed++;
    return { ok, failed };
  }

  for (let i = 0; i < doc.pages.length; i++) {
    const fileName = doc.pages.length > 1 ? `${doc.name}_${i + 1}` : doc.name;
    const success = await writeFileToTree(treeUri, fileName, 'image/jpeg', doc.pages[i].fileUri);
    if (success) ok++;
    else failed++;
  }

  return { ok, failed };
}

// §8 B3: copies a big file (a backup zip) into the folder in 1 MB chunks. writeFileToTree reads the
// whole file into one base64 string, which a backup of a few hundred MB would run out of memory
// on. The SAF document is created through the legacy API (it takes a name without extension and
// adds one from the mime type) and then written through the new API's file handle, which opens
// SAF content:// documents for writing (write-only: they can't seek). A failed or cancelled copy
// deletes the half-written file. Throws, unlike exportCopyToDeviceFolder: a backup that didn't
// arrive must be said plainly.
export async function saveFileToFolder(
  treeUri: string,
  fileNameWithoutExtension: string,
  mimeType: string,
  source: File,
  options: { signal?: AbortSignal; onProgress?: (bytesCopied: number) => void } = {}
): Promise<void> {
  const destUri = await StorageAccessFramework.createFileAsync(treeUri, fileNameWithoutExtension, mimeType);
  const input = source.open(FileMode.ReadOnly);
  let output: ReturnType<File['open']> | null = null;
  try {
    output = new File(destUri).open(FileMode.WriteOnly);
    const size = input.size ?? 0;
    let copied = 0;
    while (copied < size) {
      if (options.signal?.aborted) throw new Error('cancelled');
      const chunk = input.readBytes(Math.min(COPY_CHUNK_BYTES, size - copied));
      if (chunk.length === 0) break;
      output.writeBytes(chunk);
      copied += chunk.length;
      options.onProgress?.(copied);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    output.close();
    output = null;
  } catch (error) {
    output?.close();
    await StorageAccessFramework.deleteAsync(destUri, { idempotent: true }).catch(() => undefined);
    throw error;
  } finally {
    input.close();
  }
}

const COPY_CHUNK_BYTES = 1024 * 1024;
