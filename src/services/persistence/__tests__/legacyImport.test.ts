import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { resetStorage } from '../../../test/db';
import { __resetDbForTests, getDb } from '../dbService';
import { convertLegacyIndex, LEGACY_BACKUP_KEY, LEGACY_INDEX_KEY, migrateLibraryIndex } from '../legacyLibrary';
import { loadAll } from '../libraryRepo';

beforeEach(resetStorage);

function legacyDoc(id: string, extra: Record<string, unknown> = {}) {
  const dir = new Directory(Paths.document, 'library', id);
  return {
    id,
    name: `Doc ${id}`,
    format: 'PDF',
    mode: 'doc',
    pages: [
      {
        id: `${id}_p1`,
        fileUri: new File(dir, 'page_1.jpg').uri,
        width: 1200,
        height: 1600,
        ocr: { text: 'photosynthesis notes', blocks: [{ text: 'x', bounding: { left: 0, top: 0, width: 1, height: 1 }, lines: [] }] },
      },
    ],
    pdfUri: new File(dir, 'document.pdf').uri,
    sizeBytes: 10,
    createdAt: 1000,
    star: true,
    locked: false,
    searchHaystack: 'stale',
    ...extra,
  };
}

describe('legacy AsyncStorage import', () => {
  it('imports a v1 blob (no folders) and retires the key', async () => {
    const blob = JSON.stringify({ version: 1, documents: [legacyDoc('d1')] });
    await AsyncStorage.setItem(LEGACY_INDEX_KEY, blob);

    const { documents, courses } = await loadAll(await getDb());

    expect(courses).toEqual([]);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ id: 'd1', star: true, courseId: undefined });
    expect(documents[0].pages[0].ocr?.text).toBe('photosynthesis notes');
    expect(documents[0].pages[0].ocr?.blocks).toHaveLength(1);
    expect(documents[0].searchHaystack).toBe('doc d1 photosynthesis notes');
    expect(await AsyncStorage.getItem(LEGACY_INDEX_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_BACKUP_KEY)).toBe(blob);
  });

  it('imports a v2 blob, turning folders into courses with the same ids', async () => {
    await AsyncStorage.setItem(
      LEGACY_INDEX_KEY,
      JSON.stringify({
        version: 2,
        folders: [{ id: 'folder_1', name: 'Biology', createdAt: 5 }],
        documents: [legacyDoc('d1', { folderId: 'folder_1' }), legacyDoc('d2')],
      })
    );

    const { documents, courses } = await loadAll(await getDb());

    expect(courses).toEqual([{ id: 'folder_1', name: 'Biology', color: 'teal', archived: false, sortOrder: 0, createdAt: 5 }]);
    expect(documents.find((d) => d.id === 'd1')?.courseId).toBe('folder_1');
    expect(documents.find((d) => d.id === 'd2')?.courseId).toBeUndefined();
  });

  it('is idempotent if the key survives an interrupted import', async () => {
    const blob = JSON.stringify({ version: 1, documents: [legacyDoc('d1')] });
    await AsyncStorage.setItem(LEGACY_INDEX_KEY, blob);
    await getDb();
    // Simulate a crash between the commit and the key rename.
    await AsyncStorage.setItem(LEGACY_INDEX_KEY, blob);
    __resetDbForTests();

    const { documents } = await loadAll(await getDb());
    expect(documents).toHaveLength(1);
  });

  it('fails loudly on a corrupt blob and leaves it in place', async () => {
    await AsyncStorage.setItem(LEGACY_INDEX_KEY, '{not json');
    await expect(getDb()).rejects.toThrow();
    expect(await AsyncStorage.getItem(LEGACY_INDEX_KEY)).toBe('{not json');
    expect(await AsyncStorage.getItem(LEGACY_BACKUP_KEY)).toBeNull();
  });

  it('moves course-routed files into the flat layout and rewrites their paths', async () => {
    const legacyDir = new Directory(Paths.document, 'library', 'Courses', 'cs 101', 'd1');
    legacyDir.create({ intermediates: true });
    new File(legacyDir, 'page_1.jpg').write('jpg');
    new File(legacyDir, 'document.pdf').write('pdf');
    const doc = legacyDoc('d1', { courseFolder: 'CS 101' });
    doc.pages[0].fileUri = new File(legacyDir, 'page_1.jpg').uri;
    doc.pdfUri = new File(legacyDir, 'document.pdf').uri;
    await AsyncStorage.setItem(LEGACY_INDEX_KEY, JSON.stringify({ version: 2, folders: [], documents: [doc] }));

    const { documents } = await loadAll(await getDb());

    const flat = new Directory(Paths.document, 'library', 'd1');
    expect(documents[0].pdfUri).toBe(new File(flat, 'document.pdf').uri);
    expect(documents[0].pages[0].fileUri).toBe(new File(flat, 'page_1.jpg').uri);
    expect(new File(documents[0].pdfUri!).exists).toBe(true);
    expect(legacyDir.exists).toBe(false);
  });
});

describe('migrateLibraryIndex + convertLegacyIndex', () => {
  it('merges courseFolder names into matching folders and into each other', () => {
    const index = migrateLibraryIndex({
      version: 2,
      folders: [{ id: 'f_math', name: 'Math', createdAt: 1 }],
      documents: [
        legacyDoc('a', { courseFolder: 'math ' }),
        legacyDoc('b', { courseFolder: 'CS 101' }),
        legacyDoc('c', { courseFolder: 'cs 101' }),
        legacyDoc('d', { folderId: 'f_math', courseFolder: 'Physics' }),
        legacyDoc('e', { courseFolder: '..' }),
        legacyDoc('f', { folderId: 'deleted_folder' }),
      ],
    });
    const { courses, courseIdByDoc } = convertLegacyIndex(index);

    expect(courses.map((c) => c.name)).toEqual(['Math', 'CS 101']);
    // Each in list order, with its own palette colour.
    expect(courses.map((c) => [c.sortOrder, c.color])).toEqual([[0, 'teal'], [1, 'blue']]);
    expect(courseIdByDoc.get('a')).toBe('f_math');
    expect(courseIdByDoc.get('b')).toBe(courseIdByDoc.get('c'));
    expect(courseIdByDoc.get('d')).toBe('f_math');
    expect(courseIdByDoc.has('e')).toBe(false);
    expect(courseIdByDoc.has('f')).toBe(false);
  });
});
