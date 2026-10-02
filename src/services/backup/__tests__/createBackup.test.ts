import { Directory, File, Paths } from 'expo-file-system';
import { makeDoc, makePage } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb } from '../../persistence/dbService';
import { syncLibrary } from '../../persistence/libraryRepo';
import { backupDir, backupFileName, BackupSpaceError, createBackup, discardBackup, type BackupProgress } from '../createBackup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIBRARY_ENTRY, MANIFEST_ENTRY, parseManifest, SETTINGS_ENTRY } from '../format';
import { openZip, ZipAbortedError } from '../zip';
import type { Course, LibraryDocument } from '../../../types/models';

function write(rel: string, bytes: number | string): string {
  const file = new File(Paths.document, rel);
  file.write(typeof bytes === 'string' ? bytes : new Uint8Array(bytes));
  return file.uri;
}

function scan(id: string, courseId: string | undefined, name: string): LibraryDocument {
  return makeDoc({
    id,
    name,
    courseId,
    pdfUri: write(`library/${id}/document.pdf`, `%PDF ${id}`),
    pages: [makePage({ id: `${id}_p1`, fileUri: write(`library/${id}/page_1.jpg`, 50_000), thumbUri: write(`library/${id}/thumb_1.jpg`, 2_000) })],
  });
}

const chem: Course = { id: 'c_chem', name: 'Chemistry', color: 'teal', archived: false, sortOrder: 0, createdAt: 1 };

async function seed(): Promise<void> {
  await syncLibrary(
    await getDb(),
    { documents: [], courses: [], semesters: [], timetable: [] },
    { documents: [scan('d1', 'c_chem', 'Lab 1'), scan('d2', 'c_chem', 'Lab 2'), scan('d3', undefined, 'Notes')], courses: [chem], semesters: [], timetable: [] }
  );
}

function entryNames(file: File): string[] {
  const reader = openZip(file);
  const names = reader.entries.map((e) => e.name);
  reader.close();
  return names;
}

const NOW = new Date(2026, 9, 2, 12).getTime();

beforeEach(async () => {
  await resetStorage();
  new Directory(Paths.document, 'library').delete();
  if (backupDir().exists) backupDir().delete();
});

describe('createBackup', () => {
  it('backs up everything into one zip in the cache, with progress per document', async () => {
    await seed();
    const updates: BackupProgress[] = [];
    const result = await createBackup({ scope: { kind: 'all' }, include: 'everything' }, { now: NOW, onProgress: (p) => updates.push(p) });

    expect(result.fileName).toBe('PDF Scan backup 2026-10-02.zip');
    expect(result.file.uri.startsWith(backupDir().uri)).toBe(true);
    expect(result.bytes).toBe(result.file.size);
    expect(result.manifest).toMatchObject({ kind: 'full', restorable: 'full', counts: { documents: 3, courses: 1 } });

    const names = entryNames(result.file);
    expect(names.slice(0, 2)).toEqual([MANIFEST_ENTRY, LIBRARY_ENTRY]);
    expect(names).toEqual(expect.arrayContaining(['Courses/Chemistry/Lab 1.pdf', 'Unsorted/Notes.pdf', 'data/d1/page_1.jpg', 'data/d3/thumb_1.jpg']));

    const last = updates[updates.length - 1];
    expect(last).toEqual({ bytesDone: last.bytesTotal, bytesTotal: result.manifest.counts.bytes, documentsDone: 3, documentsTotal: 3 });
    // Never goes backwards.
    for (let i = 1; i < updates.length; i++) expect(updates[i].bytesDone).toBeGreaterThanOrEqual(updates[i - 1].bytesDone);
  });

  it("adds the settings (without device-specific ones) and the signature to a full backup only", async () => {
    await seed();
    await AsyncStorage.setItem(
      'app:settings',
      JSON.stringify({
        themePref: 'dark',
        firstRun: false,
        ocrScript: 'latin',
        crashReportsEnabled: true,
        androidExportFolderUri: 'content://tree/x',
        lastOpened: { id: 'd1', at: 1 },
        profile: { name: 'Rahim' },
        uiLanguage: 'en',
      })
    );
    write('signature/signature.png', 'png');

    const full = await createBackup({ scope: { kind: 'all' }, include: 'everything' }, { now: NOW });
    const reader = openZip(full.file);
    expect(reader.readJson(reader.entry(SETTINGS_ENTRY)!)).toEqual({ themePref: 'dark', ocrScript: 'latin', profile: { name: 'Rahim' }, uiLanguage: 'en' });
    expect(reader.entry('signature/signature.png')).toBeDefined();
    reader.close();

    const course = await createBackup({ scope: { kind: 'courses', courseIds: ['c_chem'] }, include: 'everything' }, { now: NOW });
    const names = entryNames(course.file);
    expect(names).not.toContain(SETTINGS_ENTRY);
    expect(names.some((n) => n.startsWith('signature/'))).toBe(false);
  });

  it('exports one course', async () => {
    await seed();
    const result = await createBackup({ scope: { kind: 'courses', courseIds: ['c_chem'] }, include: 'everything', courseName: 'Chemistry' }, { now: NOW });
    expect(result.fileName).toBe('Chemistry 2026-10-02.zip');
    expect(result.manifest.kind).toBe('course');
    const names = entryNames(result.file);
    expect(names.some((n) => n.includes('d3'))).toBe(false);
    expect(names).toEqual(expect.arrayContaining(['Courses/Chemistry/Lab 2.pdf', 'data/d2/page_1.jpg']));
  });

  it('PDFs only: just the readable files and the two JSON files', async () => {
    await seed();
    const result = await createBackup({ scope: { kind: 'documents', documentIds: ['d1', 'd3'] }, include: 'pdfsOnly' }, { now: NOW });
    expect(result.fileName).toBe('PDF Scan documents 2026-10-02.zip');
    expect(entryNames(result.file).sort()).toEqual([LIBRARY_ENTRY, MANIFEST_ENTRY, 'Courses/Chemistry/Lab 1.pdf', 'Unsorted/Notes.pdf'].sort());

    const reader = openZip(result.file);
    const manifest = parseManifest(reader.readJson(reader.entry(MANIFEST_ENTRY)!));
    reader.close();
    expect(manifest.restorable).toBe('pdfs');
    expect(manifest.counts.bytes).toBe(`%PDF d1`.length + `%PDF d3`.length);
  });

  it('removes the partial zip when cancelled', async () => {
    await seed();
    const controller = new AbortController();
    const promise = createBackup(
      { scope: { kind: 'all' }, include: 'everything' },
      {
        now: NOW,
        signal: controller.signal,
        onProgress: (p) => {
          if (p.bytesDone > 0) controller.abort();
        },
      }
    );
    await expect(promise).rejects.toBeInstanceOf(ZipAbortedError);
    expect(backupDir().list()).toEqual([]);
  });

  it("refuses to start when the zip wouldn't fit", async () => {
    await seed();
    const paths = Paths as { availableDiskSpace: number };
    const original = paths.availableDiskSpace;
    try {
      paths.availableDiskSpace = 50 * 1024 * 1024 + 1000;
      await expect(createBackup({ scope: { kind: 'all' }, include: 'everything' }, { now: NOW })).rejects.toBeInstanceOf(BackupSpaceError);
      expect(backupDir().exists ? backupDir().list() : []).toEqual([]);
    } finally {
      paths.availableDiskSpace = original;
    }
  });

  it('keeps only one backup in the cache, and discardBackup deletes it', async () => {
    await seed();
    await createBackup({ scope: { kind: 'all' }, include: 'everything' }, { now: NOW });
    const second = await createBackup({ scope: { kind: 'courses', courseIds: ['c_chem'] }, include: 'everything', courseName: 'Chemistry' }, { now: NOW });
    expect(backupDir().list().map((f) => f.name)).toEqual(['Chemistry 2026-10-02.zip']);
    discardBackup(second);
    expect(second.file.exists).toBe(false);
  });
});

describe('backupFileName', () => {
  it('cleans the course name', () => {
    expect(backupFileName({ scope: { kind: 'courses', courseIds: ['c'] }, courseName: 'CSE 101: Algo/DS' }, NOW)).toBe('CSE 101 Algo-DS 2026-10-02.zip');
  });
});
