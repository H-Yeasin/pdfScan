// Android-only: writes a copy of a saved document into a user-chosen device folder via
// Storage Access Framework. This lives in expo-file-system's *legacy* subpath — the new
// File/Directory API used elsewhere in this codebase has no SAF equivalent. Verified against
// the installed expo-file-system@57.0.1 source (node_modules/expo-file-system/src/legacy):
// StorageAccessFramework.createFileAsync expects a name *without* an extension and Android's
// DocumentFile.createFile appends one from the mimeType, and requestDirectoryPermissionsAsync
// already calls takePersistableUriPermission natively, so the granted tree URI survives restarts
// with no extra JS-side bookkeeping.
import { EncodingType, readAsStringAsync, StorageAccessFramework } from 'expo-file-system/legacy';
import type { LibraryDocument } from '../../types/models';

export type DeviceExportResult = { ok: number; failed: number };

// SAF exposes no folder-name API — only the tree URI itself (e.g.
// content://.../tree/primary%3ADownload%2FScans). Best-effort decode of the trailing path
// segment for display; falls back to a generic label if the URI shape is ever unexpected.
export function deriveFolderLabel(treeUri: string): string {
  try {
    const decoded = decodeURIComponent(treeUri);
    const afterColon = decoded.split(':').pop() ?? decoded;
    const segments = afterColon.split('/').filter(Boolean);
    return segments[segments.length - 1] || 'Selected folder';
  } catch {
    return 'Selected folder';
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

  for (let i = 0; i < doc.pages.length; i++) {
    const fileName = doc.pages.length > 1 ? `${doc.name}_${i + 1}` : doc.name;
    const success = await writeFileToTree(treeUri, fileName, 'image/jpeg', doc.pages[i].fileUri);
    if (success) ok++;
    else failed++;
  }

  return { ok, failed };
}
