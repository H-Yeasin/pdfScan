import { execFileSync } from 'child_process';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { resetStorage } from '../../../test/db';
import { getDb } from '../../persistence/dbService';
import { getSchemaVersion } from '../../persistence/migrations';
import { addFileFromDisk, createZip, extractToFile, openZip } from '../zip';
import {
  BACKUP_FORMAT_VERSION,
  buildManifest,
  exportRows,
  importPlan,
  insertRows,
  LIBRARY_ENTRY,
  loadCurrentLibrary,
  MANIFEST_ENTRY,
  parseManifest,
  targetPathForEntry,
  TABLES,
  upgradeLibraryJson,
  type BackupScope,
  type CurrentLibrary,
  type LibraryJson,
  type Manifest,
  type Tables,
} from '../format';
import { dumpTables, libraryFiles, seedLibrary } from '../../../test/backupLibrary';

// What B3 will do, minus progress and cancel: the readable files and data/ files, then the JSON.
async function writeBackup(db: SQLiteDatabase, scope: BackupScope, name: string): Promise<{ zip: File; manifest: Manifest }> {
  const exported = await exportRows(db, scope, await getSchemaVersion(db));
  const manifest = buildManifest(exported, { kind: scope.kind === 'all' ? 'full' : scope.kind === 'courses' ? 'course' : 'documents', appVersion: '1.0.0', createdAt: 1000 });
  const zip = new File(Paths.cache, 'backups', name);
  const writer = createZip(zip);
  writer.addJson(MANIFEST_ENTRY, manifest);
  writer.addJson(LIBRARY_ENTRY, exported.libraryJson);
  for (const file of exported.files) await addFileFromDisk(writer, file.zipPath, new File(file.uri));
  writer.finish();
  return { zip, manifest };
}

// What B4 will do, minus the preview, staging folder and progress.
async function restoreBackup(db: SQLiteDatabase, zip: File, mode: 'restore' | 'add') {
  const reader = openZip(zip);
  const manifest = parseManifest(reader.readJson(reader.entry(MANIFEST_ENTRY)!));
  const json = upgradeLibraryJson(reader.readJson(reader.entry(LIBRARY_ENTRY)!));
  const plan = importPlan(manifest, json, await loadCurrentLibrary(db), mode);
  for (const entry of reader.entries) {
    const target = targetPathForEntry(plan, manifest, entry.name);
    if (target) await extractToFile(reader, entry, new File(Paths.document, target));
  }
  reader.close();
  await db.withTransactionAsync(() => insertRows(db, plan.tables));
  return plan;
}

beforeEach(async () => {
  await resetStorage();
  new Directory(Paths.document, 'library').delete();
});

describe('backup round trip', () => {
  it('restores the same rows and files into an empty library', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const before = await dumpTables(db);
    const filesBefore = libraryFiles();

    const { zip, manifest } = await writeBackup(db, { kind: 'all' }, 'full.zip');
    expect(manifest.counts).toMatchObject({ courses: 2, documents: 5, pages: 4 });

    await resetStorage();
    new Directory(Paths.document, 'library').delete();
    const fresh = await getDb();
    const plan = await restoreBackup(fresh, zip, 'restore');
    expect(plan.counts).toEqual({ insert: 5, skip: 0, keepBoth: 0 });

    const after = await dumpTables(fresh);
    // Device-specific values aren't carried: notification ids are scheduled again by B4.
    before.deadlines = before.deadlines.map((d) => ({ ...d, reminder_ids: '[]' }));
    expect(after).toEqual(before);
    expect(libraryFiles()).toEqual(filesBefore);
    // The FTS index was filled by the triggers.
    expect(await fresh.getAllAsync("SELECT rowid FROM pages_fts WHERE pages_fts MATCH 'algebra'")).toHaveLength(1);
  });

  it('puts each PDF once, under readable course and document names', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const { zip, manifest } = await writeBackup(db, { kind: 'all' }, 'names.zip');
    const reader = openZip(zip);
    const names = reader.entries.map((e) => e.name);
    reader.close();

    expect(names).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'library.json',
        'Courses/Chemistry/Lab 1.pdf',
        'Courses/Chemistry/Lab 1 (2).pdf',
        'Courses/Math/Algebra.pdf',
        'Courses/Math/Essay.docx',
        'Unsorted/Receipt May-June.pdf',
        'data/d_lab/page_1.jpg',
        'data/d_lab/thumb_1.jpg',
        'data/d_lab/display_1.jpg',
        'data/d_lab/submissions/Lab 1 - Rahim.pdf',
      ])
    );
    expect(names.filter((n) => n.endsWith('document.pdf'))).toEqual([]);
    expect(manifest.readable.d_docx).toEqual({ path: 'Courses/Math/Essay.docx', original: 'source.docx' });

    // A computer's unzip sees the same tree.
    let listing = '';
    try {
      listing = execFileSync('unzip', ['-Z1', decodeURIComponent(zip.uri.replace('file://', ''))]).toString();
    } catch {
      return;
    }
    expect(listing).toContain('Courses/Chemistry/Lab 1.pdf');
  });
});

describe('exportRows scopes', () => {
  it('a course brings its documents, rows, semester, timetable and deadlines', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const { libraryJson } = await exportRows(db, { kind: 'courses', courseIds: ['c_chem'] }, 16);
    const ids = (table: keyof Tables) => libraryJson.tables[table].map((r) => r.id).sort();
    expect(ids('courses')).toEqual(['c_chem']);
    expect(ids('semesters')).toEqual(['sem1']);
    expect(ids('documents')).toEqual(['d_lab', 'd_lab2']);
    expect(ids('pages')).toEqual(['d_lab2_p1', 'd_lab_p1']);
    expect(ids('timetable_slots')).toEqual(['slot1']);
    expect(ids('deadlines')).toEqual(['dl1']);
    expect(ids('submissions')).toEqual(['sub1']);
    expect(ids('annotations')).toEqual(['an1']);
    expect(ids('bookmarks')).toEqual([]);
  });

  it('chosen documents bring their course, but no timetable or deadlines', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const { libraryJson, files } = await exportRows(db, { kind: 'documents', documentIds: ['d_math', 'd_loose'] }, 16);
    expect(libraryJson.tables.documents.map((r) => r.id).sort()).toEqual(['d_loose', 'd_math']);
    expect(libraryJson.tables.courses.map((r) => r.id)).toEqual(['c_math']);
    expect(libraryJson.tables.bookmarks.map((r) => r.id)).toEqual(['bm1']);
    expect(libraryJson.tables.timetable_slots).toEqual([]);
    expect(libraryJson.tables.deadlines).toEqual([]);
    expect(files.every((f) => f.zipPath.includes('d_math') || f.zipPath.includes('d_loose') || f.zipPath.startsWith('Courses/Math') || f.zipPath.startsWith('Unsorted/'))).toBe(true);
  });

  it('rewrites file paths to zip paths and drops device-specific values', async () => {
    const db = await getDb();
    await seedLibrary(db);
    await db.runAsync("UPDATE documents SET disk_bytes = 999 WHERE id = 'd_lab'");
    const { libraryJson } = await exportRows(db, { kind: 'all' }, 16);
    const lab = libraryJson.tables.documents.find((r) => r.id === 'd_lab')!;
    expect(lab.pdf_path).toBe('Courses/Chemistry/Lab 1.pdf');
    expect(lab.disk_bytes).toBeNull();
    const page = libraryJson.tables.pages.find((r) => r.id === 'd_lab_p1')!;
    expect(page).toMatchObject({ master_path: 'data/d_lab/page_1.jpg', thumb_path: 'data/d_lab/thumb_1.jpg' });
    expect(libraryJson.tables.deadlines[0].reminder_ids).toBe('[]');
  });

  it('leaves out files that are missing, keeping the row', async () => {
    const db = await getDb();
    await seedLibrary(db);
    new File(Paths.document, 'library', 'd_math', 'document.pdf').delete();
    const { files, readable, libraryJson } = await exportRows(db, { kind: 'all' }, 16);
    expect(readable.d_math).toBeUndefined();
    expect(files.some((f) => f.zipPath.startsWith('data/d_math/document.pdf'))).toBe(false);
    expect(libraryJson.tables.documents.find((r) => r.id === 'd_math')!.pdf_path).toBe('data/d_math/document.pdf');
  });
});

// --- importPlan, pure --------------------------------------------------------------------------

function emptyCurrent(): CurrentLibrary {
  return {
    documents: new Map(),
    courses: [],
    semesters: [],
    ids: Object.fromEntries(TABLES.map((t) => [t, new Set<string>()])) as CurrentLibrary['ids'],
  };
}

function backupJson(): { manifest: Pick<Manifest, 'readable'>; json: LibraryJson } {
  const tables = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Tables;
  tables.semesters = [{ id: 'sem1', name: 'Spring 2026', starts_on: '2026-01-10', ends_on: null, archived: 0, created_at: 1 }];
  tables.courses = [{ id: 'c1', name: 'Chemistry', code: 'CHE101', color: 'teal', semester_id: 'sem1', archived: 0, sort_order: 0, created_at: 1 }];
  tables.documents = [{ id: 'd1', name: 'Lab 1', course_id: 'c1', updated_at: 500, pdf_path: 'Courses/Chemistry/Lab 1.pdf', content_path: null }];
  tables.pages = [{ id: 'p1', document_id: 'd1', idx: 0, master_path: 'data/d1/page_1.jpg', display_path: null, thumb_path: 'data/d1/thumb_1.jpg' }];
  tables.annotations = [{ id: 'a1', document_id: 'd1', page_id: 'p1', kind: 'note' }];
  tables.bookmarks = [{ id: 'b1', document_id: 'd1', page_id: 'p1' }];
  tables.submissions = [{ id: 's1', document_id: 'd1', course_id: 'c1', file_name: 'x.pdf' }];
  tables.deadlines = [{ id: 'dl1', course_id: 'c1', title: 'Lab 2', done_submission_id: 's1', reminder_ids: '[]' }];
  tables.timetable_slots = [{ id: 't1', course_id: 'c1', weekday: 1, start_min: 0, end_min: 60 }];
  return {
    manifest: { readable: { d1: { path: 'Courses/Chemistry/Lab 1.pdf', original: 'document.pdf' } } },
    json: { formatVersion: 1, schemaVersion: 16, tables },
  };
}

let idCounter = 0;
const newId = (prefix: string) => `${prefix}_new${++idCounter}`;
beforeEach(() => {
  idCounter = 0;
});

describe('importPlan: restore', () => {
  it('keeps every id in an empty library and maps paths into library/<id>/', () => {
    const { manifest, json } = backupJson();
    const plan = importPlan(manifest, json, emptyCurrent(), 'restore', { newId });
    expect(plan.documents).toEqual([{ sourceId: 'd1', targetId: 'd1', action: 'insert', name: 'Lab 1' }]);
    expect(plan.tables.documents[0]).toMatchObject({ id: 'd1', course_id: 'c1', pdf_path: 'library/d1/document.pdf' });
    expect(plan.tables.pages[0]).toMatchObject({ id: 'p1', master_path: 'library/d1/page_1.jpg', thumb_path: 'library/d1/thumb_1.jpg' });
    for (const table of TABLES) expect(plan.tables[table]).toHaveLength(json.tables[table].length);
    expect(plan.tables.deadlines[0].done_submission_id).toBe('s1');
  });

  it('adds nothing when restoring the same backup twice', () => {
    const { manifest, json } = backupJson();
    const current = emptyCurrent();
    for (const table of TABLES) for (const row of json.tables[table]) current.ids[table].add(String(row.id));
    current.documents.set('d1', 500);
    const plan = importPlan(manifest, json, current, 'restore', { newId });
    expect(plan.counts).toEqual({ insert: 0, skip: 1, keepBoth: 0 });
    for (const table of TABLES) expect(plan.tables[table]).toEqual([]);
    expect(targetPathForEntry(plan, manifest, 'data/d1/page_1.jpg')).toBeNull();
  });

  it('keeps both when the same document changed since, with new ids for everything of the copy', () => {
    const { manifest, json } = backupJson();
    const current = emptyCurrent();
    current.documents.set('d1', 900);
    for (const table of ['documents', 'pages', 'annotations', 'bookmarks', 'submissions'] as const) {
      for (const row of json.tables[table]) current.ids[table].add(String(row.id));
    }
    current.ids.courses.add('c1');
    const plan = importPlan(manifest, json, current, 'restore', { newId, restoredSuffix: ' (restored)' });

    const [decision] = plan.documents;
    expect(decision).toMatchObject({ sourceId: 'd1', action: 'keepBoth', name: 'Lab 1 (restored)' });
    expect(decision.targetId).not.toBe('d1');
    expect(plan.tables.documents[0]).toMatchObject({ id: decision.targetId, name: 'Lab 1 (restored)', course_id: 'c1' });
    const page = plan.tables.pages[0];
    expect(page.id).not.toBe('p1');
    expect(page.master_path).toBe(`library/${decision.targetId}/page_1.jpg`);
    expect(plan.tables.annotations[0]).toMatchObject({ document_id: decision.targetId, page_id: page.id });
    expect(plan.tables.annotations[0].id).not.toBe('a1');
    expect(targetPathForEntry(plan, manifest, 'Courses/Chemistry/Lab 1.pdf')).toBe(`library/${decision.targetId}/document.pdf`);
  });

  it('gives a new id to a row whose id is taken by something else here', () => {
    const { manifest, json } = backupJson();
    const current = emptyCurrent();
    // A merge on this phone gave page p1 to another document.
    current.ids.pages.add('p1');
    const plan = importPlan(manifest, json, current, 'restore', { newId });
    expect(plan.tables.documents[0].id).toBe('d1');
    expect(plan.tables.pages[0].id).toBe('page_new1');
    expect(plan.tables.bookmarks[0].page_id).toBe('page_new1');
  });
});

describe('importPlan: add', () => {
  it('gives everything new ids and joins a course with the same name and code', () => {
    const { manifest, json } = backupJson();
    const current = emptyCurrent();
    current.courses = [{ id: 'mine', name: ' chemistry', code: 'che101', sortOrder: 3 }];
    current.ids.courses.add('mine');
    const plan = importPlan(manifest, json, current, 'add', { newId });

    expect(plan.courses).toEqual([{ sourceId: 'c1', targetId: 'mine', action: 'match' }]);
    expect(plan.tables.courses).toEqual([]);
    expect(plan.tables.semesters).toEqual([]);
    expect(plan.tables.documents[0]).toMatchObject({ id: 'doc_new1', course_id: 'mine', pdf_path: 'library/doc_new1/document.pdf' });
    expect(plan.tables.pages[0].id).toBe('page_new2');
    // The classmate's submissions, timetable and (for a matched course) deadlines stay theirs.
    expect(plan.tables.submissions).toEqual([]);
    expect(plan.tables.timetable_slots).toEqual([]);
    expect(plan.tables.deadlines).toEqual([]);
  });

  it('creates a course that isn’t here, in a semester matched by name, after the existing courses', () => {
    const { manifest, json } = backupJson();
    const current = emptyCurrent();
    current.courses = [{ id: 'other', name: 'Chemistry', code: 'CHE102', sortOrder: 4 }];
    current.semesters = [{ id: 'my_sem', name: 'spring 2026' }];
    const plan = importPlan(manifest, json, current, 'add', { newId });

    expect(plan.courses[0]).toMatchObject({ sourceId: 'c1', action: 'insert' });
    expect(plan.tables.courses[0]).toMatchObject({ id: plan.courses[0].targetId, semester_id: 'my_sem', sort_order: 5 });
    expect(plan.tables.semesters).toEqual([]);
    expect(plan.tables.deadlines[0]).toMatchObject({ course_id: plan.courses[0].targetId, done_submission_id: null });
  });

  it('brings the semester along when there is no matching one', () => {
    const { manifest, json } = backupJson();
    const plan = importPlan(manifest, json, emptyCurrent(), 'add', { newId });
    expect(plan.tables.semesters).toHaveLength(1);
    expect(plan.tables.semesters[0].id).not.toBe('sem1');
    expect(plan.tables.courses[0].semester_id).toBe(plan.tables.semesters[0].id);
  });
});

describe('targetPathForEntry', () => {
  it('maps document files and refuses anything that leaves its folder', () => {
    const { manifest, json } = backupJson();
    const plan = importPlan(manifest, json, emptyCurrent(), 'restore', { newId });
    expect(targetPathForEntry(plan, manifest, 'data/d1/submissions/x.pdf')).toBe('library/d1/submissions/x.pdf');
    expect(targetPathForEntry(plan, manifest, 'data/d1/../../evil.js')).toBeNull();
    expect(targetPathForEntry(plan, manifest, 'data/d1/')).toBeNull();
    expect(targetPathForEntry(plan, manifest, 'data/unknown/page_1.jpg')).toBeNull();
    expect(targetPathForEntry(plan, manifest, 'manifest.json')).toBeNull();
  });
});

describe('format versions', () => {
  it('maps an older library.json forward through each upgrade', () => {
    const v1: LibraryJson = { formatVersion: 1, schemaVersion: 16, tables: { documents: [{ id: 'd1', title: 'Old' }] } as unknown as Tables };
    const upgrades = {
      1: (json: LibraryJson): LibraryJson => ({
        ...json,
        formatVersion: 2,
        tables: { ...json.tables, documents: json.tables.documents.map(({ title, ...rest }) => ({ ...rest, name: title })) },
      }),
    };
    const upgraded = upgradeLibraryJson(v1, upgrades, 2);
    expect(upgraded.formatVersion).toBe(2);
    expect(upgraded.tables.documents).toEqual([{ id: 'd1', name: 'Old' }]);
    // Tables the old format didn't have come back empty.
    expect(upgraded.tables.bookmarks).toEqual([]);
  });

  it('refuses a backup from a newer app, and anything that isn’t a backup', () => {
    expect(() => upgradeLibraryJson({ formatVersion: BACKUP_FORMAT_VERSION + 1, tables: {} })).toThrow(
      expect.objectContaining({ code: 'TOO_NEW' })
    );
    expect(() => upgradeLibraryJson({ hello: 1 })).toThrow(expect.objectContaining({ code: 'NOT_A_BACKUP' }));
    expect(() => parseManifest({ format: 'something-else', formatVersion: 1 })).toThrow(expect.objectContaining({ code: 'NOT_A_BACKUP' }));
    expect(() => parseManifest({ format: 'pdfscan-backup', formatVersion: 99 })).toThrow(expect.objectContaining({ code: 'TOO_NEW' }));
  });
});
