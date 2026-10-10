import { Directory, File, Paths } from 'expo-file-system';
import { fileStamp } from '../reader/pageCache';

// §18 W19 (A15): what the DOCX and sheet viewers parse is kept for the next time the same file is
// opened, so going back to a workbook doesn't read and parse it again (a 5 MB XLSX took seconds
// on every mount). Two layers:
// - in memory, a few entries, least recently used out first (a parsed file is big);
// - on disk, for a DOCX's HTML only (mammoth is the slow part; the HTML is one string). It lives
//   in the system cache folder, so it may vanish at any time and nothing depends on it.
// An entry is named by the file's uri, size and modified time (pageCache.fileStamp): a file that
// was edited or replaced is simply another entry, and the stale one ages out.

export type ParseCache<T> = {
  // The cached value, or `load()`'s (two callers asking at once share one load). A failed load
  // isn't kept.
  get: (key: string, load: () => Promise<T>) => Promise<T>;
  peek: (key: string) => Promise<T> | undefined;
  drop: (key: string) => void;
  clear: () => void;
  size: () => number;
};

export function createParseCache<T>(max: number): ParseCache<T> {
  // A Map keeps insertion order: the first key is the least recently used.
  const entries = new Map<string, Promise<T>>();
  const touch = (key: string, value: Promise<T>) => {
    entries.delete(key);
    entries.set(key, value);
    while (entries.size > max) entries.delete(entries.keys().next().value as string);
  };
  return {
    get(key, load) {
      const cached = entries.get(key);
      if (cached) {
        touch(key, cached);
        return cached;
      }
      const loading = load();
      touch(key, loading);
      loading.catch(() => {
        if (entries.get(key) === loading) entries.delete(key);
      });
      return loading;
    },
    peek: (key) => entries.get(key),
    drop: (key) => void entries.delete(key),
    clear: () => entries.clear(),
    size: () => entries.size,
  };
}

// The name of a file as it is now; `part` tells apart what was parsed of it (a sheet's index).
export function parseKey(uri: string, part: string | number = ''): string {
  return `${fileStamp(uri)}:${part}`;
}

// --- the disk layer, for a DOCX's HTML ---

const ROOT = 'docx-html';
export const DOCX_HTML_CACHE_FILES = 4;
// Pictures are inlined in the HTML as base64; past this it isn't worth a second copy on disk.
export const DOCX_HTML_CACHE_MAX_CHARS = 12 * 1024 * 1024;

function htmlDir(): Directory {
  return new Directory(Paths.cache, ROOT);
}

function quietly<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch {
    // Best-effort, like every cache here: the caller parses the file instead.
    return undefined;
  }
}

export function readCachedHtml(stamp: string): string | null {
  return (
    quietly(() => {
      const file = new File(htmlDir(), `${stamp}.html`);
      return file.exists ? file.textSync() : null;
    }) ?? null
  );
}

// Keeps the newest few files (by the time they were written; reading one doesn't count).
export function writeCachedHtml(stamp: string, html: string): void {
  if (html.length > DOCX_HTML_CACHE_MAX_CHARS) return;
  quietly(() => {
    const dir = htmlDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, `${stamp}.html`);
    if (file.exists) file.delete();
    file.create();
    file.write(html);
    const others = dir
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.name !== file.name)
      .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
    for (const old of others.slice(DOCX_HTML_CACHE_FILES - 1)) old.delete();
  });
}

const docxHtml = createParseCache<string>(2);

// A DOCX's body HTML (docxService.docxToHtml), from memory, else from disk, else parsed by
// `parse` and kept in both.
export function cachedDocxHtml(uri: string, parse: (uri: string) => Promise<string>): Promise<string> {
  const stamp = fileStamp(uri);
  return docxHtml.get(stamp, async () => {
    const stored = readCachedHtml(stamp);
    if (stored !== null) return stored;
    const html = await parse(uri);
    writeCachedHtml(stamp, html);
    return html;
  });
}

// A document is being deleted: what was kept of this file goes too (call it while the file is
// still there: its size and modified time are part of the name). The HTML is the document's
// text, and "deleted" has to mean it is gone from this phone.
export function dropCachedHtml(uri: string): void {
  const stamp = fileStamp(uri);
  docxHtml.drop(stamp);
  quietly(() => {
    const file = new File(htmlDir(), `${stamp}.html`);
    if (file.exists) file.delete();
  });
}

export function clearParseCaches(): void {
  docxHtml.clear();
  quietly(() => {
    const dir = htmlDir();
    if (dir.exists) dir.delete();
  });
}
