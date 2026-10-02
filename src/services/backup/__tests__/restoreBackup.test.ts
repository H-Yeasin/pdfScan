import * as fs from 'fs';
import { Directory, File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { dumpTables, libraryFiles, seedLibrary } from '../../../test/backupLibrary';
import { resetStorage } from '../../../test/db';
import { getDb } from '../../persistence/dbService';
import { createBackup } from '../createBackup';
import { LIBRARY_ENTRY, MANIFEST_ENTRY } from '../format';
import { applyRestore, previewRestore, readBackup } from '../restoreBackup';
import { createZip, openZip } from '../zip';
import type { Tables } from '../format';

const notifications = Notifications as unknown as {
  __reset: (options?: { permission?: 'granted' | 'denied' | 'undetermined' }) => void;
  __scheduled: () => { content: { data?: Record<string, unknown> } }[];
};

const DAY = 24 * 60 * 60 * 1000;

// Keeps a made zip out of the cache folder createBackup empties each time.
async function makeZip(request: Parameters<typeof createBackup>[0]): Promise<File> {
  const result = await createBackup(request);
  const kept = new File(Paths.document, 'zips', result.fileName);
  if (kept.exists) kept.delete();
  result.file.copySync(kept);
  return kept;
}

// A new phone: empty database, no library, no settings.
async function freshPhone(): Promise<void> {
  await resetStorage();
  new Directory(Paths.document, 'library').delete();
  new Directory(Paths.document, 'signature').delete();
}

function pathOf(file: File): string {
  return decodeURIComponent(file.uri.replace('file://', ''));
}

const incoming = () => new Directory(Paths.document, 'library', '.incoming');

beforeEach(async () => {
  await freshPhone();
  new Directory(Paths.document, 'zips').delete();
  notifications.__reset({ permission: 'granted' });
});

describe('restore', () => {
  it('brings everything back into an empty library', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const before = await dumpTables(db);
    const filesBefore = libraryFiles();
    const zip = await makeZip({ scope: { kind: 'all' }, include: 'everything' });

    await freshPhone();
    const backup = readBackup(zip);
    expect(backup.manifest.kind).toBe('full');
    const preview = await previewRestore(backup, 'restore');
    expect(preview.plan.counts).toEqual({ insert: 5, skip: 0, keepBoth: 0 });
    expect(preview.fits).toBe(true);
    expect(preview.bytesNeeded).toBeGreaterThan(0);

    const fresh = await getDb();
    await applyRestore(backup, preview);
    const after = await dumpTables(fresh);
    before.deadlines = before.deadlines.map((d) => ({ ...d, reminder_ids: '[]' }));
    before.documents = before.documents.map((d) => ({ ...d, disk_bytes: null }));
    expect(after).toEqual(before);
    expect(libraryFiles()).toEqual(filesBefore);
    expect(incoming().exists).toBe(false);
  });

  it('adds nothing the second time', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const zip = await makeZip({ scope: { kind: 'all' }, include: 'everything' });
    await freshPhone();
    await applyRestore(readBackup(zip), await previewRestore(readBackup(zip), 'restore'));
    const once = await dumpTables(await getDb());
    const filesOnce = libraryFiles();

    const again = await previewRestore(readBackup(zip), 'restore');
    expect(again.plan.counts).toEqual({ insert: 0, skip: 5, keepBoth: 0 });
    expect(again.bytesNeeded).toBe(0);
    await applyRestore(readBackup(zip), again);
    expect(await dumpTables(await getDb())).toEqual(once);
    expect(libraryFiles()).toEqual(filesOnce);
  });

  it("brings back the signature when this phone has none, but never replaces one", async () => {
    const db = await getDb();
    await seedLibrary(db);
    new File(Paths.document, 'signature', 'signature.png').write('mine');
    const zip = await makeZip({ scope: { kind: 'all' }, include: 'everything' });

    await freshPhone();
    const backup = readBackup(zip);
    expect(backup.hasSignature).toBe(true);
    const result = await applyRestore(backup, await previewRestore(backup, 'restore'), { restoreSignature: true });
    expect(result.signatureRestored).toBe(true);
    expect(new File(Paths.document, 'signature', 'signature.png').textSync()).toBe('mine');

    new File(Paths.document, 'signature', 'signature.png').write('new phone');
    const again = await applyRestore(backup, await previewRestore(backup, 'restore'), { restoreSignature: true });
    expect(again.signatureRestored).toBe(false);
    expect(new File(Paths.document, 'signature', 'signature.png').textSync()).toBe('new phone');
  });

  it('schedules reminders again for deadlines still ahead', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const dueAt = Date.now() + 3 * DAY;
    await db.runAsync("INSERT INTO deadlines (id, course_id, title, due_at, reminder_ids, created_at) VALUES ('dl2', 'c_chem', 'Quiz', ?, '[\"old\"]', 1)", [dueAt]);
    const zip = await makeZip({ scope: { kind: 'all' }, include: 'everything' });

    await freshPhone();
    notifications.__reset({ permission: 'granted' });
    const result = await applyRestore(readBackup(zip), await previewRestore(readBackup(zip), 'restore'));
    // dl1 is done (and long past); dl2 gets its two reminders.
    expect(result.remindersScheduled).toBe(1);
    expect(notifications.__scheduled().map((n) => n.content.data?.deadlineId)).toEqual(['dl2', 'dl2']);
    const row = await (await getDb()).getFirstAsync<{ reminder_ids: string }>("SELECT reminder_ids FROM deadlines WHERE id = 'dl2'");
    expect(JSON.parse(row!.reminder_ids)).toHaveLength(2);
  });
});

describe('add', () => {
  it("joins a matching course and leaves the rest of the library alone", async () => {
    const db = await getDb();
    await seedLibrary(db);
    const zip = await makeZip({ scope: { kind: 'courses', courseIds: ['c_chem'] }, include: 'everything', courseName: 'Chemistry' });

    // A classmate's phone: its own Chemistry course (same name and code) and one document.
    await freshPhone();
    const theirs = await getDb();
    await theirs.runAsync(
      "INSERT INTO courses (id, name, code, color, archived, sort_order, created_at) VALUES ('their_chem', 'Chemistry', 'CHE101', 'blue', 0, 0, 1)"
    );
    new File(Paths.document, 'library', 'their_doc', 'document.pdf').write('%PDF theirs');
    await theirs.runAsync(
      "INSERT INTO documents (id, name, format, mode, pdf_path, created_at, updated_at, course_id) VALUES ('their_doc', 'Mine', 'PDF', 'doc', 'library/their_doc/document.pdf', 1, 1, 'their_chem')"
    );
    const before = await dumpTables(theirs);

    const backup = readBackup(zip);
    expect(backup.manifest.kind).toBe('course');
    const preview = await previewRestore(backup, 'add');
    expect(preview.plan.courses).toEqual([{ sourceId: 'c_chem', targetId: 'their_chem', action: 'match' }]);
    await applyRestore(backup, preview);

    const after = await dumpTables(theirs);
    expect(after.courses).toEqual(before.courses);
    expect(after.documents.find((d) => d.id === 'their_doc')).toEqual(before.documents[0]);
    const added = after.documents.filter((d) => d.id !== 'their_doc');
    expect(added.map((d) => d.name).sort()).toEqual(['Lab 1', 'Lab 1']);
    expect(added.every((d) => d.course_id === 'their_chem' && d.id !== 'd_lab' && d.id !== 'd_lab2')).toBe(true);
    // The sharer's submissions and timetable stay theirs; the files came with the documents.
    expect(after.submissions).toEqual([]);
    expect(after.timetable_slots).toEqual([]);
    for (const doc of added) expect(new File(Paths.document, String(doc.pdf_path)).exists).toBe(true);
    expect(new File(Paths.document, 'library', 'their_doc', 'document.pdf').textSync()).toBe('%PDF theirs');
  });
});

describe('failures leave the library as it was', () => {
  async function libraryWithOneDoc(): Promise<{ before: Tables; files: Record<string, string> }> {
    const db = await getDb();
    new File(Paths.document, 'library', 'keep', 'document.pdf').write('%PDF keep');
    await db.runAsync(
      "INSERT INTO documents (id, name, format, mode, pdf_path, created_at, updated_at) VALUES ('keep', 'Keep', 'PDF', 'doc', 'library/keep/document.pdf', 1, 1)"
    );
    return { before: await dumpTables(db), files: libraryFiles() };
  }

  it('a damaged entry: nothing inserted, nothing copied, .incoming removed', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const zip = await makeZip({ scope: { kind: 'all' }, include: 'everything' });
    // Damage the last file in the zip, so earlier documents were already staged when it fails.
    const reader = openZip(zip);
    const last = reader.entries[reader.entries.length - 1];
    reader.close();
    const bytes = fs.readFileSync(pathOf(zip));
    const nameLength = Buffer.from(last.name, 'utf8').length;
    bytes[last.headerOffset + 30 + nameLength] ^= 0xff;
    fs.writeFileSync(pathOf(zip), bytes);

    await freshPhone();
    const { before, files } = await libraryWithOneDoc();
    const backup = readBackup(zip);
    await expect(applyRestore(backup, await previewRestore(backup, 'restore'))).rejects.toMatchObject({ code: 'CRC_MISMATCH' });
    expect(await dumpTables(await getDb())).toEqual(before);
    expect(libraryFiles()).toEqual(files);
    expect(incoming().exists).toBe(false);
  });

  it('a database error: rolled back, staged files gone', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const zip = await makeZip({ scope: { kind: 'all' }, include: 'everything' });

    await freshPhone();
    const { files } = await libraryWithOneDoc();
    const backup = readBackup(zip);
    const preview = await previewRestore(backup, 'restore');
    // Between the preview and the restore, a page id the plan meant to keep appears.
    const fresh = await getDb();
    await fresh.runAsync(
      "INSERT INTO pages (id, document_id, idx, master_path, width, height) VALUES ('d_math_p1', 'keep', 0, 'x', 1, 1)"
    );
    const before = await dumpTables(fresh);

    await expect(applyRestore(backup, preview)).rejects.toThrow();
    expect(await dumpTables(fresh)).toEqual(before);
    expect(libraryFiles()).toEqual(files);
    expect(incoming().exists).toBe(false);
  });

  it('a cancelled restore', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const zip = await makeZip({ scope: { kind: 'all' }, include: 'everything' });
    await freshPhone();
    const { before, files } = await libraryWithOneDoc();
    const controller = new AbortController();
    const backup = readBackup(zip);
    const promise = applyRestore(backup, await previewRestore(backup, 'restore'), {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.documentsDone > 0) controller.abort();
      },
    });
    await expect(promise).rejects.toThrow(/cancelled/);
    expect(await dumpTables(await getDb())).toEqual(before);
    expect(libraryFiles()).toEqual(files);
  });
});

describe('reading a backup', () => {
  function zipWith(entries: Record<string, unknown>): File {
    const file = new File(Paths.document, 'zips', 'made.zip');
    const writer = createZip(file);
    for (const [name, value] of Object.entries(entries)) writer.addJson(name, value);
    writer.finish();
    return file;
  }

  it('refuses a backup from a newer PDF Scan', () => {
    const zip = zipWith({
      [MANIFEST_ENTRY]: { format: 'pdfscan-backup', formatVersion: 99, readable: {} },
      [LIBRARY_ENTRY]: { formatVersion: 99, schemaVersion: 99, tables: {} },
    });
    expect(() => readBackup(zip)).toThrow(expect.objectContaining({ code: 'TOO_NEW' }));
  });

  it("refuses a zip that isn't a PDF Scan backup", () => {
    expect(() => readBackup(zipWith({ 'notes.json': { hello: 1 } }))).toThrow(expect.objectContaining({ code: 'NOT_A_BACKUP' }));
    expect(() => readBackup(zipWith({ [MANIFEST_ENTRY]: { format: 'other' }, [LIBRARY_ENTRY]: {} }))).toThrow(
      expect.objectContaining({ code: 'NOT_A_BACKUP' })
    );
  });

  it('restores a "PDFs only" export as imported PDFs', async () => {
    const db = await getDb();
    await seedLibrary(db);
    const zip = await makeZip({ scope: { kind: 'all' }, include: 'pdfsOnly' });
    await freshPhone();

    const backup = readBackup(zip);
    expect(backup.manifest.restorable).toBe('pdfs');
    await applyRestore(backup, await previewRestore(backup, 'restore'));
    const after = await dumpTables(await getDb());
    const lab = after.documents.find((d) => d.id === 'd_lab')!;
    expect(lab).toMatchObject({ format: 'PDF', source_kind: 'imported_pdf', indexed_at: null, pdf_path: 'library/d_lab/document.pdf' });
    expect(after.documents.find((d) => d.id === 'd_docx')).toMatchObject({ format: 'DOCX', content_path: 'library/d_docx/source.docx' });
    // The indexer makes pages again; the old ones (and what pointed at them) are gone.
    expect(after.pages).toEqual([]);
    expect(after.annotations).toEqual([]);
    expect(after.bookmarks).toEqual([]);
    expect(Object.keys(libraryFiles()).sort()).toEqual(
      ['d_docx/source.docx', 'd_lab/document.pdf', 'd_lab2/document.pdf', 'd_loose/document.pdf', 'd_math/document.pdf'].sort()
    );
  });
});
