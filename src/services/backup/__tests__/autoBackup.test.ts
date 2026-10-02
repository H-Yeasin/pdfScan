import { Directory, File, Paths } from 'expo-file-system';
import { resetStorage } from '../../../test/db';
import { seedLibrary } from '../../../test/backupLibrary';
import { getDb } from '../../persistence/dbService';
import { libraryChangedAt } from '../../persistence/libraryRepo';
import { runAutoBackup } from '../autoBackup';
import { BackupBusyError, createBackup } from '../createBackup';
import { openZip } from '../zip';

// A SAF folder stand-in: a plain folder; createFileAsync makes "<name>.zip" (" (n)" when taken, as
// Android does), deleteAsync deletes.
jest.mock('expo-file-system/legacy', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsMock = require('expo-file-system') as typeof import('expo-file-system');
  return {
    StorageAccessFramework: {
      createFileAsync: async (treeUri: string, name: string) => {
        for (let n = 0; ; n++) {
          const file = new fsMock.File(new fsMock.Directory(treeUri), n === 0 ? `${name}.zip` : `${name} (${n}).zip`);
          if (!file.exists) {
            file.create();
            return file.uri;
          }
        }
      },
      deleteAsync: async (uri: string) => new fsMock.File(uri).delete(),
    },
  };
});

const DAY = 24 * 60 * 60 * 1000;
const folder = () => new Directory(Paths.document, 'Drive', 'Backups');
const names = () => folder().list().map((f) => f.name).sort();

beforeEach(async () => {
  await resetStorage();
  new Directory(Paths.document, 'library').delete();
  folder().delete();
  folder().create({ intermediates: true });
});

describe('runAutoBackup', () => {
  it('saves a full backup into the folder and keeps only its last two, never other files', async () => {
    await seedLibrary(await getDb());
    new File(folder(), 'my notes.zip').write('not ours');
    const start = new Date(2026, 9, 1, 9).getTime();

    let uris: string[] = [];
    for (let week = 0; week < 3; week++) {
      const result = await runAutoBackup({ folderUri: folder().uri, previousUris: uris, now: start + week * 7 * DAY });
      uris = result.uris;
    }
    expect(names()).toEqual(['PDF Scan auto-backup 2026-10-08.zip', 'PDF Scan auto-backup 2026-10-15.zip', 'my notes.zip']);
    expect(uris).toHaveLength(2);

    const reader = openZip(new File(uris[1]));
    expect(reader.entry('manifest.json')).toBeDefined();
    expect(reader.entry('Courses/Chemistry/Lab 1.pdf')).toBeDefined();
    reader.close();
    // The cache copy is gone.
    expect(new Directory(Paths.cache, 'backup').list()).toEqual([]);
  });

  it('forgets a backup the student already deleted', async () => {
    await seedLibrary(await getDb());
    const first = await runAutoBackup({ folderUri: folder().uri, previousUris: [], now: 1 });
    new File(first.uri).delete();
    const second = await runAutoBackup({ folderUri: folder().uri, previousUris: ['content://gone', first.uri], now: 2 });
    expect(second.uris).toHaveLength(2);
    expect(names()).toHaveLength(1);
  });
});

describe('createBackup', () => {
  it('refuses a second backup while one is running', async () => {
    await seedLibrary(await getDb());
    const first = createBackup({ scope: { kind: 'all' }, include: 'everything' });
    await expect(createBackup({ scope: { kind: 'all' }, include: 'everything' })).rejects.toBeInstanceOf(BackupBusyError);
    await first;
    await expect(createBackup({ scope: { kind: 'all' }, include: 'everything' })).resolves.toBeDefined();
  });
});

describe('libraryChangedAt', () => {
  it('is the newest document change or course, null when empty', async () => {
    const db = await getDb();
    expect(await libraryChangedAt(db)).toBeNull();
    await seedLibrary(db);
    const at = await libraryChangedAt(db);
    expect(at).toBeGreaterThan(Date.now() - 60_000);
    await db.runAsync("INSERT INTO courses (id, name, color, archived, sort_order, created_at) VALUES ('later', 'Later', 'teal', 0, 9, ?)", [at! + 5000]);
    expect(await libraryChangedAt(db)).toBe(at! + 5000);
  });
});
