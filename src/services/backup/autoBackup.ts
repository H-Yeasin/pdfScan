import { StorageAccessFramework } from 'expo-file-system/legacy';
import { saveFileToFolder } from '../export/deviceExportService';
import { createBackup, discardBackup } from './createBackup';
import { rotateAutoBackups } from './schedule';

// §8 B5, Android: one automatic backup - a full backup written to the cache, streamed into the
// backup folder, then the folder trimmed to the newest automatic backups. Only zips this app
// recorded making are ever deleted (`previousUris`); nothing else in the folder is touched, and a
// zip the student already deleted or moved is simply gone from the list.

export type AutoBackupResult = { uri: string; bytes: number; uris: string[]; removed: number };

export async function runAutoBackup(options: {
  folderUri: string;
  previousUris: readonly string[];
  now?: number;
  signal?: AbortSignal;
  // 0..1: the zip is about half the work, the copy into the folder the other half.
  onProgress?: (fraction: number) => void;
}): Promise<AutoBackupResult> {
  const now = options.now ?? Date.now();
  const result = await createBackup(
    { scope: { kind: 'all' }, include: 'everything', automatic: true },
    {
      now,
      signal: options.signal,
      onProgress: (p) => options.onProgress?.(p.bytesTotal > 0 ? (p.bytesDone / p.bytesTotal) * 0.5 : 0),
    }
  );
  try {
    const uri = await saveFileToFolder(options.folderUri, result.fileName.replace(/\.zip$/i, ''), 'application/zip', result.file, {
      signal: options.signal,
      onProgress: (copied) => options.onProgress?.(0.5 + (result.bytes > 0 ? (copied / result.bytes) * 0.5 : 0.5)),
    });
    const { keep, remove } = rotateAutoBackups([...options.previousUris, uri]);
    let removed = 0;
    for (const old of remove) {
      try {
        await StorageAccessFramework.deleteAsync(old, { idempotent: true });
        removed += 1;
      } catch (error) {
        // Already gone, or the folder's permission changed: it's no longer ours to track.
        console.warn('autoBackup: could not delete an old backup', error);
      }
    }
    return { uri, bytes: result.bytes, uris: keep, removed };
  } finally {
    discardBackup(result);
  }
}
