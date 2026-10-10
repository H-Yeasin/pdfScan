import { Directory, File, Paths } from 'expo-file-system';
import { deleteDocumentFiles, getDocumentDir } from '../../persistence/libraryFiles';
import { fileStamp, openPageCache, PAGE_CACHE_MAX_BYTES, pageCacheName, dropPageCache, pruneOrder, prunePageCache } from '../pageCache';
import { renderKey } from '../renderPlan';
import type { PageSource } from '../surfacePages';

const root = () => new Directory(Paths.cache, 'reader');
const names = () => (root().exists ? root().list().map((entry) => entry.name).sort() : []);

function pdf(docId: string, bytes: string): string {
  const file = new File(getDocumentDir(docId), 'document.pdf');
  file.write(bytes);
  return file.uri;
}

function fill(cache: { uriFor: (key: string) => string }, key: string, size: number) {
  new File(cache.uriFor(key)).write(new Uint8Array(size));
}

describe('§18 W9 page cache', () => {
  beforeEach(() => {
    if (root().exists) root().delete();
  });

  it('names a folder by the document and the state of its file', () => {
    const uri = pdf('doc_a', 'one');
    const name = pageCacheName('doc_a', uri);
    expect(name).toMatch(/^[0-9a-f]{16}-[0-9a-f]{16}$/);
    expect(pageCacheName('doc_a', uri)).toBe(name);
    // Another document with the same bytes, and the same document as a scan.
    expect(pageCacheName('doc_b', pdf('doc_b', 'one'))).not.toBe(name);
    expect(pageCacheName('doc_a')).not.toBe(name);
    expect(pageCacheName('doc_a').split('-')[0]).toBe(name.split('-')[0]);
  });

  it('the stamp changes when the file does', () => {
    const uri = pdf('doc_a', 'one');
    const before = fileStamp(uri);
    expect(fileStamp(uri)).toBe(before);
    pdf('doc_a', 'one and more');
    expect(fileStamp(uri)).not.toBe(before);
    // A file that isn't there still has a name.
    expect(fileStamp('file:///nowhere/x.pdf')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('render keys are stable, and differ by page, size, tile, turn and palette', () => {
    const page: PageSource = { kind: 'pdf', page: 3, pointsW: 595, pointsH: 842 };
    const scan: PageSource = { kind: 'image', uri: 'file:///library/d/page_1.jpg', pixelW: 1800, pixelH: 2400, imageTurn: 0 };
    expect(renderKey(page, 1080)).toBe('p3-w1080');
    expect(renderKey(page, 1080, { col: 2, row: 5, bucket: 4 })).toBe('p3-w1080-t2_5_4');
    expect(renderKey(page, 1080, { col: 2, row: 5, bucket: 4 }, '201e1dd4cfc6')).toBe('p3-w1080-t2_5_4-n201e1dd4cfc6');
    expect(renderKey(scan, 1080)).toMatch(/^i[0-9a-f]{16}-w1080$/);
    const keys = [
      renderKey(page, 1080),
      renderKey(page, 2160),
      renderKey({ ...page, page: 4 }, 1080),
      renderKey(page, 1080, { col: 0, row: 0, bucket: 3 }),
      renderKey(page, 1080, { col: 0, row: 0, bucket: 4 }),
      renderKey(page, 1080, { col: 1, row: 0, bucket: 3 }),
      renderKey(page, 1080, { col: 0, row: 1, bucket: 3 }),
      renderKey(page, 1080, undefined, 'night'),
      renderKey(scan, 1080),
      renderKey({ ...scan, imageTurn: 90 }, 1080),
      renderKey({ ...scan, uri: 'file:///library/d/page_2.jpg' }, 1080),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    // Safe as file names.
    keys.forEach((key) => expect(key).toMatch(/^[a-z0-9_-]+$/));
  });

  it('opens a folder, finds what is in it, and drops the folders of older states', () => {
    const uri = pdf('doc_a', 'one');
    const first = openPageCache('doc_a', uri, 1000);
    expect(first.has('p0-w1080')).toBe(false);
    fill(first, 'p0-w1080', 10);
    expect(first.has('p0-w1080')).toBe(true);
    expect(first.uriFor('p0-w1080').endsWith(`/reader/${first.name}/p0-w1080.jpg`)).toBe(true);
    const other = openPageCache('doc_b', pdf('doc_b', 'two'), 1000);

    // The PDF was rebuilt (marks baked in, pages edited).
    pdf('doc_a', 'one, rebuilt');
    const second = openPageCache('doc_a', uri, 2000);
    expect(second.name).not.toBe(first.name);
    expect(second.has('p0-w1080')).toBe(false);
    expect(names()).toEqual([other.name, second.name].sort());
    // Opening again is the same folder, with its files.
    fill(second, 'p0-w1080', 10);
    expect(openPageCache('doc_a', uri, 3000).has('p0-w1080')).toBe(true);
  });

  it('deleting a document deletes its renders', () => {
    const a = openPageCache('doc_a', pdf('doc_a', 'one'));
    const b = openPageCache('doc_b');
    fill(a, 'p0-w1080', 10);
    deleteDocumentFiles('doc_a');
    expect(names()).toEqual([b.name]);
    dropPageCache('doc_b');
    expect(names()).toEqual([]);
    // Nothing there: nothing happens.
    deleteDocumentFiles('doc_never_opened');
  });

  it('prune order: the least recently opened first, the newest always stays', () => {
    const folders = [
      { name: 'c', size: 60, usedAt: 300 },
      { name: 'a', size: 60, usedAt: 100 },
      { name: 'd', size: 60, usedAt: 400 },
      { name: 'b', size: 60, usedAt: 200 },
    ];
    expect(pruneOrder(folders, 240)).toEqual([]);
    expect(pruneOrder(folders, 200)).toEqual(['a']);
    expect(pruneOrder(folders, 100)).toEqual(['a', 'b', 'c']);
    expect(pruneOrder(folders, 10)).toEqual(['a', 'b', 'c']);
    expect(pruneOrder([], 10)).toEqual([]);
    // Never opened through openPageCache (no mark): the oldest of all.
    expect(pruneOrder([...folders, { name: 'z', size: 60, usedAt: 0 }], 240)).toEqual(['z']);
    expect(PAGE_CACHE_MAX_BYTES).toBe(200 * 1024 * 1024);
  });

  it('prunes folders on disk down to the limit', () => {
    const a = openPageCache('doc_a', undefined, 1000);
    const b = openPageCache('doc_b', undefined, 2000);
    const c = openPageCache('doc_c', undefined, 3000);
    [a, b, c].forEach((cache) => fill(cache, 'p0-w1080', 1000));
    expect(prunePageCache(10_000)).toBe(0);
    expect(prunePageCache(2500)).toBeGreaterThanOrEqual(1000);
    expect(names()).toEqual([b.name, c.name].sort());
    // Opening `b` again makes it the newest.
    openPageCache('doc_b', undefined, 4000);
    prunePageCache(1500);
    expect(names()).toEqual([b.name]);
    // Nothing to prune without the folder.
    root().delete();
    expect(prunePageCache(0)).toBe(0);
  });
});
