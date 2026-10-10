import { Directory, File, Paths } from 'expo-file-system';
import { hashKey } from '../../utils/hash';

// §18 W9: the page surface's rendered images on disk, so a page drawn once opens at once the next
// time. One folder per document and state of its file:
//   <cache>/reader/<hash(owner)>-<stamp>/<render key>.jpg
// `owner` is the library document's id, or an outside file's uri. `stamp` is a hash of the PDF's
// uri, size and modified time: when `document.pdf` is rebuilt the stamp changes, the old folder
// is deleted at the next open, and no image view can show a stale file under a name it has
// already decoded. A scan has no single file; its folder's stamp is fixed and its pages are named
// by their own files (renderPlan.renderKey).
//
// Everything here is the system cache: it may vanish at any time, and nothing else may depend on
// it. Only expo-file-system and the hash are imported, so libraryFiles can use it at boot.

const ROOT = 'reader';
const SCAN_STAMP = 'pages';
// Holds the time the folder was last opened, in its text: a folder's own modified time isn't
// readable here, and a file's can't be set.
const USED_MARK = '.used';
export const PAGE_CACHE_MAX_BYTES = 200 * 1024 * 1024;

function rootDir(): Directory {
  return new Directory(Paths.cache, ROOT);
}

function ownerPrefix(owner: string): string {
  return `${hashKey(owner)}-`;
}

// Changes whenever the file does. A file that can't be read still gets a name (its uri's).
export function fileStamp(uri: string): string {
  let size: number | null = null;
  let modified: number | null = null;
  try {
    const file = new File(uri);
    if (file.exists) {
      size = file.size;
      modified = file.lastModified;
    }
  } catch {
    // An outside uri this API can't stat: the uri alone names it.
  }
  return hashKey(`${uri}|${size ?? ''}|${modified ?? ''}`);
}

export function pageCacheName(owner: string, pdfUri?: string): string {
  return ownerPrefix(owner) + (pdfUri ? fileStamp(pdfUri) : SCAN_STAMP);
}

export type PageCache = {
  name: string;
  // Where the render with this key is, or will be written (pdf-native's `out`).
  uriFor: (key: string) => string;
  has: (key: string) => boolean;
};

function quietly(run: () => void): void {
  try {
    run();
  } catch {
    // The cache is best-effort: a folder that can't be listed or deleted is tried again later.
  }
}

function folders(): Directory[] {
  const root = rootDir();
  if (!root.exists) return [];
  return root.list().filter((entry): entry is Directory => entry instanceof Directory);
}

// The folder for a document as it is now: created, marked as just used, and the same document's
// folders for older states of its file deleted. Pass the PDF's uri for everything read through a
// pdfium session; leave it out for a scan.
export function openPageCache(owner: string, pdfUri?: string, now: number = Date.now()): PageCache {
  const name = pageCacheName(owner, pdfUri);
  const dir = new Directory(rootDir(), name);
  quietly(() => {
    if (!dir.exists) dir.create({ intermediates: true });
    new File(dir, USED_MARK).write(String(now));
    const prefix = ownerPrefix(owner);
    for (const other of folders()) {
      if (other.name !== name && other.name.startsWith(prefix)) other.delete();
    }
  });
  return {
    name,
    uriFor: (key) => new File(dir, `${key}.jpg`).uri,
    has: (key) => new File(dir, `${key}.jpg`).exists,
  };
}

// A document was deleted: its renders go with it.
export function dropPageCache(owner: string): void {
  quietly(() => {
    const prefix = ownerPrefix(owner);
    for (const dir of folders()) {
      if (dir.name.startsWith(prefix)) dir.delete();
    }
  });
}

export type CacheFolder = { name: string; size: number; usedAt: number };

// Which folders to delete so the rest fit in `maxBytes`: the least recently opened first. The
// most recent one always stays, even alone over the limit (the Reader may have it open).
export function pruneOrder(all: readonly CacheFolder[], maxBytes: number = PAGE_CACHE_MAX_BYTES): string[] {
  const oldestFirst = [...all].sort((a, b) => a.usedAt - b.usedAt || a.name.localeCompare(b.name));
  let total = oldestFirst.reduce((sum, folder) => sum + folder.size, 0);
  const drop: string[] = [];
  for (const folder of oldestFirst.slice(0, -1)) {
    if (total <= maxBytes) break;
    drop.push(folder.name);
    total -= folder.size;
  }
  return drop;
}

function usedAt(dir: Directory): number {
  try {
    const mark = new File(dir, USED_MARK);
    const at = mark.exists ? Number(mark.textSync()) : 0;
    return Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

// Keeps the cache under its limit. Call it away from anything the user is waiting for (when the
// Reader closes, at deferred boot): it lists and sizes every folder. Returns the bytes freed.
export function prunePageCache(maxBytes: number = PAGE_CACHE_MAX_BYTES): number {
  let freed = 0;
  quietly(() => {
    const all = folders();
    const sizes = new Map(all.map((dir) => [dir.name, dir.size ?? 0]));
    const drop = new Set(pruneOrder(all.map((dir) => ({ name: dir.name, size: sizes.get(dir.name) ?? 0, usedAt: usedAt(dir) })), maxBytes));
    for (const dir of all) {
      if (!drop.has(dir.name)) continue;
      dir.delete();
      freed += sizes.get(dir.name) ?? 0;
    }
  });
  return freed;
}
