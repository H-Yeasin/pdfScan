import { Directory, File, Paths } from 'expo-file-system';
import { makeDoc } from '../../../test/fixtures';
import { PreviewTooLargeError, SHEET_MAX_BYTES } from '../../documents/sheetService';
import { carryGrant, grantAfterReward } from '../../pro/proTask';
import {
  csvToText,
  deleteRow,
  insertRow,
  loadCsvForEdit,
  loadTextForEdit,
  parseCsvForEdit,
  saveEditedText,
  setCell,
  TXT_EDIT_MAX_BYTES,
} from '../textEdit';

function writeFile(name: string, content: string | Uint8Array): string {
  const file = new File(Paths.cache, 'edit-test', name);
  file.write(content);
  return file.uri;
}

async function readUtf8Strict(uri: string): Promise<string> {
  // `fatal`: throws if what was written isn't valid UTF-8.
  return new TextDecoder('utf-8', { fatal: true }).decode(await new File(uri).bytes());
}

describe('§12 D7 CSV round trip', () => {
  it('keeps quotes, commas and line breaks inside values', () => {
    const text = 'name,quote\r\n"Rahim, M.","He said ""hi"""\r\n"two\nlines",plain';
    const table = parseCsvForEdit(text);
    expect(table.rows).toEqual([
      ['name', 'quote'],
      ['Rahim, M.', 'He said "hi"'],
      ['two\nlines', 'plain'],
    ]);
    expect(table.newline).toBe('\r\n');
    const back = csvToText(table);
    expect(back).toBe(text);
    expect(parseCsvForEdit(back).rows).toEqual(table.rows);
  });

  it('keeps a semicolon delimiter', () => {
    const table = parseCsvForEdit('a;b\n1,5;2,5\n');
    expect(table.delimiter).toBe(';');
    expect(table.rows).toEqual([
      ['a', 'b'],
      ['1,5', '2,5'],
    ]);
    expect(csvToText({ ...table, rows: setCell(table.rows, 1, 0, '3,5') })).toBe('a;b\n3,5;2,5');
  });

  it('quotes a value only when an edit needs it', () => {
    const table = parseCsvForEdit('a,b\n1,2');
    const rows = setCell(table.rows, 1, 1, 'x, "y"');
    expect(csvToText({ ...table, rows })).toBe('a,b\n1,"x, ""y"""');
  });
});

describe('§12 D7 CSV edits', () => {
  const rows = [
    ['a', 'b', 'c'],
    ['1', '2'],
  ];

  it('sets a cell without touching the input, padding short rows', () => {
    const next = setCell(rows, 1, 2, '3');
    expect(next[1]).toEqual(['1', '2', '3']);
    expect(rows[1]).toEqual(['1', '2']);
    expect(setCell(rows, 3, 1, 'x')).toEqual([...rows, [], ['', 'x']]);
  });

  it('inserts an empty row as wide as the table', () => {
    expect(insertRow(rows, 0)).toEqual([rows[0], ['', '', ''], rows[1]]);
    expect(insertRow(rows, -1)[0]).toEqual(['', '', '']);
    expect(insertRow(rows, 9)[2]).toEqual(['', '', '']);
    expect(insertRow([], -1)).toEqual([['']]);
  });

  it('deletes a row', () => {
    expect(deleteRow(rows, 0)).toEqual([rows[1]]);
    expect(deleteRow(rows, 5)).toEqual(rows);
  });
});

describe('§12 D7 loading for edit', () => {
  it('applies the sheet size cap to a CSV', async () => {
    const big = writeFile('big.csv', new Uint8Array(SHEET_MAX_BYTES + 1));
    await expect(loadCsvForEdit(big)).rejects.toBeInstanceOf(PreviewTooLargeError);
  });

  it('caps a TXT the editor would hold in one field', async () => {
    const big = writeFile('big.txt', new Uint8Array(TXT_EDIT_MAX_BYTES + 1).fill(65));
    await expect(loadTextForEdit(big)).rejects.toBeInstanceOf(PreviewTooLargeError);
    expect((await loadTextForEdit(writeFile('ok.txt', 'hello'))).text).toBe('hello');
  });
});

describe('§12 D7 saving', () => {
  function libraryTxt(text: string) {
    const doc = makeDoc({ format: 'TXT', name: 'Notes', pdfUri: undefined });
    const file = new File(Paths.document, 'library', doc.id, 'document.txt');
    file.write(text);
    return { ...doc, contentUri: file.uri, pages: [{ ...doc.pages[0], id: 'page1', fileUri: '', ocr: { text, blocks: [] } }] };
  }

  it('swaps a new UTF-8 file in for a library document and refreshes its search text', async () => {
    const doc = libraryTxt('old text');
    const result = await saveEditedText({ doc }, 'TXT', 'Café — নতুন');
    if (result.kind !== 'updated') throw new Error('expected an update');
    const { patch } = result;
    expect(result.id).toBe(doc.id);
    expect(patch.contentUri).not.toBe(doc.contentUri);
    expect(await readUtf8Strict(patch.contentUri!)).toBe('Café — নতুন');
    // The original stays until the database points at the new file.
    expect(new File(doc.contentUri).exists).toBe(true);
    expect(patch.pages![0]).toMatchObject({ id: 'page1', ocr: { text: 'Café — নতুন' } });
    expect(patch.searchHaystack).toContain('নতুন');
    expect(patch.sizeBytes).toBe(new File(patch.contentUri!).size);

    // The next save removes the copy that's no longer pointed at.
    const second = await saveEditedText({ doc: { ...doc, ...patch } }, 'TXT', 'third');
    if (second.kind !== 'updated') throw new Error('expected an update');
    expect(new File(doc.contentUri).exists).toBe(false);
    expect(new File(patch.contentUri!).exists).toBe(true);
    expect(new File(second.patch.contentUri!).exists).toBe(true);
  });

  it('writes UTF-8 even when the file was read with the Latin-1 fallback', async () => {
    const uri = writeFile('latin1.txt', new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
    const { text, fallbackUsed } = await loadTextForEdit(uri);
    expect(fallbackUsed).toBe(true);
    const doc = { ...libraryTxt(''), contentUri: uri };
    const result = await saveEditedText({ doc }, 'TXT', text);
    if (result.kind !== 'updated') throw new Error('expected an update');
    expect(await readUtf8Strict(result.patch.contentUri!)).toBe('café');
  });

  it('saves a file from outside into the library and never writes the original', async () => {
    const uri = writeFile('outside.csv', 'a,b\n1,2');
    const external = { uri, name: 'Marks.csv', format: 'CSV' as const, sizeBytes: 7, sourceUri: 'content://x', importedAt: 1 };
    const result = await saveEditedText({ external }, 'CSV', 'a,b\n1,3');
    if (result.kind !== 'added') throw new Error('expected a new document');
    expect(await new File(uri).text()).toBe('a,b\n1,2');
    expect(result.doc).toMatchObject({ name: 'Marks.csv', format: 'CSV' });
    expect(await readUtf8Strict(result.doc.contentUri!)).toBe('a,b\n1,3');
    expect(result.doc.pages[0].ocr?.text).toBe('a,b\n1,3');
    // The temp copy is gone.
    expect(new Directory(Paths.cache, 'edit').list()).toEqual([]);
  });
});

describe('§12 D7 carrying the edit session to the saved copy', () => {
  const NOON = Date.UTC(2026, 9, 3, 12);

  it('copies a live session to the new id with the same end', () => {
    const grants = [grantAfterReward('editFiles', 'file://outside.csv', NOON, 30)];
    const next = carryGrant(grants, 'editFiles', 'file://outside.csv', 'doc1', NOON + 1000);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ ...grants[0], docId: 'doc1' });
  });

  it('carries nothing for an expired session or a once grant', () => {
    const session = [grantAfterReward('editFiles', 'a', NOON, 30)];
    expect(carryGrant(session, 'editFiles', 'a', 'b', NOON + 31 * 60_000)).toEqual(session);
    const once = [grantAfterReward('convert', 'a', NOON, 30)];
    expect(carryGrant(once, 'convert', 'a', 'b', NOON)).toEqual(once);
  });
});
