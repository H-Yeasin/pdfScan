import { Directory, File, Paths } from 'expo-file-system';
import * as fs from 'fs';
import { fileStamp } from '../../reader/pageCache';
import {
  cachedDocxHtml,
  clearParseCaches,
  createParseCache,
  DOCX_HTML_CACHE_FILES,
  DOCX_HTML_CACHE_MAX_CHARS,
  dropCachedHtml,
  parseKey,
  readCachedHtml,
  writeCachedHtml,
} from '../parseCache';

function write(name: string, content: string): File {
  const file = new File(Paths.cache, 'parse', name);
  file.write(content);
  return file;
}

// The file's modified time, set by hand: two writes in one test can land in the same millisecond.
function touch(file: File, at: number): void {
  fs.utimesSync(decodeURIComponent(file.uri.replace('file://', '')), at, at);
}

beforeEach(() => {
  clearParseCaches();
  const dir = new Directory(Paths.cache, 'parse');
  if (dir.exists) dir.delete();
});

describe('createParseCache', () => {
  it('loads once per key', async () => {
    const cache = createParseCache<string>(2);
    const load = jest.fn(async () => 'parsed');
    expect(await cache.get('a', load)).toBe('parsed');
    expect(await cache.get('a', load)).toBe('parsed');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares one load between two callers asking at once', async () => {
    const cache = createParseCache<number>(2);
    let calls = 0;
    const load = () => new Promise<number>((resolve) => setTimeout(() => resolve(++calls), 5));
    expect(await Promise.all([cache.get('a', load), cache.get('a', load)])).toEqual([1, 1]);
  });

  it('drops the least recently used entry', async () => {
    const cache = createParseCache<string>(2);
    await cache.get('a', async () => 'A');
    await cache.get('b', async () => 'B');
    // 'a' is used again, so 'b' is the one to go.
    await cache.get('a', async () => 'A2');
    await cache.get('c', async () => 'C');
    expect(cache.size()).toBe(2);
    expect(cache.peek('b')).toBeUndefined();
    expect(await cache.peek('a')).toBe('A');
    expect(await cache.peek('c')).toBe('C');
  });

  it('does not keep a load that failed', async () => {
    const cache = createParseCache<string>(2);
    await expect(cache.get('a', async () => Promise.reject(new Error('damaged')))).rejects.toThrow('damaged');
    await Promise.resolve();
    expect(cache.peek('a')).toBeUndefined();
    expect(await cache.get('a', async () => 'fine')).toBe('fine');
  });
});

describe('parseKey', () => {
  it('names the file as it is now: another size or modified time is another entry', () => {
    const file = write('marks.xlsx', 'one');
    touch(file, 1000);
    const first = parseKey(file.uri, 0);
    expect(parseKey(file.uri, 0)).toBe(first);
    expect(parseKey(file.uri, 1)).not.toBe(first);

    touch(file, 2000);
    const later = parseKey(file.uri, 0);
    expect(later).not.toBe(first);

    file.write('longer');
    touch(file, 2000);
    expect(parseKey(file.uri, 0)).not.toBe(later);
    expect(parseKey(write('other.xlsx', 'one').uri, 0)).not.toBe(first);
  });
});

describe('the DOCX HTML cache', () => {
  it('parses once, then answers from memory', async () => {
    const file = write('essay.docx', 'docx bytes');
    const parse = jest.fn(async () => '<p>Essay</p>');
    expect(await cachedDocxHtml(file.uri, parse)).toBe('<p>Essay</p>');
    expect(await cachedDocxHtml(file.uri, parse)).toBe('<p>Essay</p>');
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('parses again when the file has changed', async () => {
    const file = write('essay.docx', 'docx bytes');
    touch(file, 1000);
    const parse = jest.fn(async () => `<p>${file.textSync()}</p>`);
    expect(await cachedDocxHtml(file.uri, parse)).toBe('<p>docx bytes</p>');
    file.write('edited');
    touch(file, 2000);
    expect(await cachedDocxHtml(file.uri, parse)).toBe('<p>edited</p>');
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('keeps the HTML on disk for the next launch, the newest few files', () => {
    for (let i = 0; i < DOCX_HTML_CACHE_FILES + 2; i += 1) {
      writeCachedHtml(`stamp${i}`, `<p>${i}</p>`);
      touch(new File(Paths.cache, 'docx-html', `stamp${i}.html`), 1000 + i);
    }
    expect(new Directory(Paths.cache, 'docx-html').list()).toHaveLength(DOCX_HTML_CACHE_FILES);
    expect(readCachedHtml('stamp0')).toBeNull();
    expect(readCachedHtml(`stamp${DOCX_HTML_CACHE_FILES + 1}`)).toBe(`<p>${DOCX_HTML_CACHE_FILES + 1}</p>`);
    expect(readCachedHtml('never')).toBeNull();
  });

  it('reads the disk copy instead of parsing', async () => {
    const file = write('essay.docx', 'docx bytes');
    // As a launch finds it: nothing in memory, the HTML of this file on disk.
    writeCachedHtml(fileStamp(file.uri), '<p>Essay</p>');
    const parse = jest.fn(async () => '<p>parsed again</p>');
    expect(await cachedDocxHtml(file.uri, parse)).toBe('<p>Essay</p>');
    expect(parse).not.toHaveBeenCalled();
  });

  it('writes what it parsed to disk', async () => {
    const file = write('essay.docx', 'docx bytes');
    await cachedDocxHtml(file.uri, async () => '<p>Essay</p>');
    expect(readCachedHtml(fileStamp(file.uri))).toBe('<p>Essay</p>');
  });

  it('forgets a deleted document, in memory and on disk', async () => {
    const file = write('essay.docx', 'docx bytes');
    await cachedDocxHtml(file.uri, async () => '<p>Essay</p>');
    dropCachedHtml(file.uri);
    expect(readCachedHtml(fileStamp(file.uri))).toBeNull();
    const parse = jest.fn(async () => '<p>again</p>');
    expect(await cachedDocxHtml(file.uri, parse)).toBe('<p>again</p>');
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('does not write a huge document to disk', () => {
    writeCachedHtml('big', 'x'.repeat(DOCX_HTML_CACHE_MAX_CHARS + 1));
    expect(readCachedHtml('big')).toBeNull();
  });
});
