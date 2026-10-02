import { Directory, File, Paths } from 'expo-file-system';
import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb } from '../../persistence/dbService';
import { loadDiskBytes, syncLibrary, type LoadedLibrary } from '../../persistence/libraryRepo';
import {
  checkSpaceFor,
  cleanCaches,
  CRITICAL_SPACE_BYTES,
  LOW_SPACE_BYTES,
  spaceLevel,
  storageReport,
} from '../usage';
import type { LibraryDocument } from '../../../types/models';

const MB = 1024 * 1024;
const EMPTY: LoadedLibrary = { documents: [], courses: [], semesters: [], timetable: [] };

function writeDoc(id: string, bytes: number, overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  const pdf = new File(Paths.document, 'library', id, 'document.pdf');
  pdf.write(new Uint8Array(bytes));
  return makeDoc({ id, pdfUri: pdf.uri, pages: [makePage({ fileUri: '' })], sourceKind: 'imported_pdf', ...overrides });
}

beforeEach(async () => {
  await resetStorage();
  new Directory(Paths.document, 'library').delete();
  for (const entry of Paths.cache.list()) entry.delete();
});

describe('storageReport', () => {
  it('sums each document folder per course, biggest first, and counts caches', async () => {
    const a = writeDoc('doc_a', 3000, { courseId: undefined });
    const b = writeDoc('doc_b', 5000, { courseId: 'c1' });
    const c = writeDoc('doc_c', 1000, { courseId: 'c1' });
    new File(Paths.cache, 'share', 'x.pdf').write(new Uint8Array(700));
    new File(Paths.document, 'library', '.trash', '1_doc_old', 'x.jpg').write(new Uint8Array(200));

    const report = await storageReport([a, b, c]);
    expect(report.byCourse).toEqual([
      { courseId: 'c1', bytes: 6000, documents: 2 },
      { courseId: null, bytes: 3000, documents: 1 },
    ]);
    expect(report.documents.map((d) => d.id)).toEqual(['doc_b', 'doc_a', 'doc_c']);
    expect(report.cacheBytes).toBe(700);
    expect(report.otherLibraryBytes).toBe(200);
    expect(report.totalBytes).toBe(9000 + 200 + 700);
    expect(report.freeBytes).toBe(Paths.availableDiskSpace);
  });

  it('caches each size in documents.disk_bytes and measures again after an edit', async () => {
    const db = await getDb();
    const doc = writeDoc('doc_a', 3000);
    const saved: LoadedLibrary = { ...EMPTY, documents: [doc] };
    await syncLibrary(db, EMPTY, saved);
    expect((await loadDiskBytes(db)).get('doc_a')).toBeNull();

    await storageReport([doc]);
    expect((await loadDiskBytes(db)).get('doc_a')).toBe(3000);

    // A rename or a star keeps the measurement...
    const renamed: LoadedLibrary = { ...EMPTY, documents: [{ ...doc, name: 'Renamed' }] };
    await syncLibrary(db, saved, renamed);
    expect((await loadDiskBytes(db)).get('doc_a')).toBe(3000);

    // ...an edit that changes the files (here a compress: a new size) clears it.
    new File(Paths.document, 'library', 'doc_a', 'document.pdf').write(new Uint8Array(1000));
    const compressed: LoadedLibrary = { ...EMPTY, documents: [{ ...renamed.documents[0], sizeBytes: 1000 }] };
    await syncLibrary(db, renamed, compressed);
    expect((await loadDiskBytes(db)).get('doc_a')).toBeNull();
    expect((await storageReport(compressed.documents)).documents[0].bytes).toBe(1000);
  });
});

describe('cleanCaches', () => {
  it('empties the folders the app owns and loose temp images, and prunes external-open', () => {
    new File(Paths.cache, 'share', 'a.pdf').write(new Uint8Array(100));
    new File(Paths.cache, 'pdf-ops', 'b.pdf').write(new Uint8Array(100));
    new File(Paths.cache, 'render_1.jpg').write(new Uint8Array(100));
    new File(Paths.cache, 'other-lib', 'keep.bin').write(new Uint8Array(100));
    for (let i = 0; i < 7; i++) new File(Paths.document, 'external-open', `ext_${i}`, 'source.pdf').write('x');

    expect(cleanCaches({ sessionActive: false })).toBeGreaterThanOrEqual(300);
    expect(new Directory(Paths.cache, 'share').exists).toBe(false);
    expect(new Directory(Paths.cache, 'pdf-ops').exists).toBe(false);
    expect(new File(Paths.cache, 'render_1.jpg').exists).toBe(false);
    expect(new File(Paths.cache, 'other-lib', 'keep.bin').exists).toBe(true);
    expect(new Directory(Paths.document, 'external-open').list()).toHaveLength(5);
  });

  it('keeps an open scan session’s images', () => {
    new File(Paths.cache, 'share', 'a.pdf').write('x');
    new File(Paths.cache, 'ImageManipulator', 'page.jpg').write('x');
    new File(Paths.cache, 'cropped_1.jpg').write('x');

    cleanCaches({ sessionActive: true });
    expect(new Directory(Paths.cache, 'share').exists).toBe(false);
    expect(new File(Paths.cache, 'ImageManipulator', 'page.jpg').exists).toBe(true);
    expect(new File(Paths.cache, 'cropped_1.jpg').exists).toBe(true);
  });
});

describe('space guard', () => {
  it('is ok above 300 MB, low below it, critical below 50 MB (after what will be written)', () => {
    expect(spaceLevel(LOW_SPACE_BYTES + 10 * MB, 0)).toBe('ok');
    expect(spaceLevel(LOW_SPACE_BYTES + 10 * MB, 20 * MB)).toBe('low');
    expect(spaceLevel(LOW_SPACE_BYTES - 1, 0)).toBe('low');
    expect(spaceLevel(CRITICAL_SPACE_BYTES + MB, 0)).toBe('low');
    expect(spaceLevel(CRITICAL_SPACE_BYTES + MB, 2 * MB)).toBe('critical');
    expect(spaceLevel(CRITICAL_SPACE_BYTES - 1, 0)).toBe('critical');
  });

  it("lets everything through when the phone can't say how much is free", () => {
    expect(spaceLevel(null, 10_000 * MB)).toBe('ok');
  });

  it('reads the free space from the file system', () => {
    const paths = Paths as { availableDiskSpace: number };
    const original = paths.availableDiskSpace;
    try {
      paths.availableDiskSpace = 100 * MB;
      expect(checkSpaceFor(0)).toEqual({ level: 'low', freeBytes: 100 * MB });
      expect(checkSpaceFor(60 * MB).level).toBe('critical');
    } finally {
      paths.availableDiskSpace = original;
    }
  });
});
