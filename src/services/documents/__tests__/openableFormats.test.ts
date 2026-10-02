import { File, Paths } from 'expo-file-system';
import { OPENABLE_FORMATS, PICKER_MIME_TYPES } from '../formatCapabilities';
import { detectDocFormat, isLegacyWordDoc, MIME_BY_FORMAT } from '../../../utils/docFormat';
import { importExternalFile, LegacyWordDocError } from '../../files/externalFileService';
import { ZIP_MIME_TYPES } from '../../backup/incomingZip';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require('../../../../app.json') as {
  expo: { android: { intentFilters: { action: string; data: { mimeType?: string }[] }[] } };
};

describe('formats a file from outside can be opened as (§7 R5)', () => {
  it('are exactly the ones with a viewer', () => {
    expect([...OPENABLE_FORMATS].sort()).toEqual(['CSV', 'DOCX', 'PDF', 'TXT', 'XLS', 'XLSX']);
  });

  it('the picker offers exactly those formats', () => {
    const picked = new Set(PICKER_MIME_TYPES.map((mime) => detectDocFormat('content://x', { mimeType: mime })));
    expect([...picked].sort()).toEqual([...OPENABLE_FORMATS].sort());
  });

  it('"Open with" registers a MIME type for every one of them, and nothing else but backup zips', () => {
    const view = appJson.expo.android.intentFilters.find((f) => f.action === 'VIEW' && f.data.some((d) => d.mimeType));
    const mimes = view!.data.map((d) => d.mimeType).filter((m): m is string => !!m);
    for (const format of OPENABLE_FORMATS) expect(mimes).toContain(MIME_BY_FORMAT[format]);
    // §8 B4: zips go to the restore / import flow, not to a viewer.
    const zips: readonly string[] = ZIP_MIME_TYPES;
    expect(mimes.filter((mime) => !zips.includes(mime)).every((mime) => PICKER_MIME_TYPES.includes(mime))).toBe(true);
    expect(mimes).toEqual(expect.arrayContaining([...ZIP_MIME_TYPES]));
  });
});

describe('legacy .doc', () => {
  it('is never detected as a format', () => {
    expect(detectDocFormat('file:///x/notes.doc')).toBeNull();
    expect(detectDocFormat('content://x', { mimeType: 'application/msword' })).toBeNull();
    expect(isLegacyWordDoc('content://x', { originalFileName: 'Notes.DOC' })).toBe(true);
    expect(isLegacyWordDoc('content://x', { mimeType: 'application/msword' })).toBe(true);
    expect(isLegacyWordDoc('file:///x/notes.docx')).toBe(false);
  });

  it('is refused on import with its own error', async () => {
    const file = new File(Paths.cache, 'in', 'old.doc');
    file.write('binary word');
    await expect(importExternalFile(file.uri)).rejects.toBeInstanceOf(LegacyWordDocError);
  });
});
