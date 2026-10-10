import { File, Paths } from 'expo-file-system';
import * as XLSX from 'xlsx';
import { cachedSheetPreview, loadSheetPreview, loadSheets, PreviewTooLargeError, SHEET_MAX_BYTES, SHEET_MAX_CELLS, SHEET_PREVIEW_ROWS } from '../sheetService';

function writeFile(name: string, content: string | Uint8Array): string {
  const file = new File(Paths.cache, 'sheets', name);
  file.write(content);
  return file.uri;
}

function workbook(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return wb;
}

function writeWorkbook(name: string, wb: XLSX.WorkBook, bookType: 'xlsx' | 'biff8'): string {
  return writeFile(name, new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer));
}

describe('loadSheets', () => {
  it('reads a CSV', async () => {
    const uri = writeFile('grades.csv', 'Name,Mark\nAsha,91\nRafi,78\n');
    expect(await loadSheets(uri, 'CSV')).toEqual([{ name: 'Sheet1', rows: [['Name', 'Mark'], ['Asha', '91'], ['Rafi', '78']] }]);
  });

  it('reads every sheet of an XLSX, cells as shown', async () => {
    const uri = writeWorkbook('marks.xlsx', workbook({ Term1: [['Name', 'Mark'], ['Asha', 91]], Term2: [['Name'], ['Rafi']] }), 'xlsx');
    const sheets = await loadSheets(uri, 'XLSX');
    expect(sheets.map((s) => s.name)).toEqual(['Term1', 'Term2']);
    expect(sheets[0].rows).toEqual([['Name', 'Mark'], ['Asha', '91']]);
    expect(sheets[1].rows).toEqual([['Name'], ['Rafi']]);
  });

  it('reads a legacy XLS', async () => {
    const uri = writeWorkbook('old.xls', workbook({ Sheet1: [['Roll', 'Lab'], [12, 'done']] }), 'biff8');
    expect((await loadSheets(uri, 'XLS'))[0].rows).toEqual([['Roll', 'Lab'], ['12', 'done']]);
  });

  it('builds rows for the cells that exist, not a bloated declared range', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd']]);
    sheet['!ref'] = 'A1:Z5000';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    const uri = writeWorkbook('bloated.xlsx', wb, 'xlsx');
    expect((await loadSheets(uri, 'XLSX'))[0].rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('refuses a file over the size cap without parsing it', async () => {
    const uri = writeFile('big.csv', 'a,b\n'.repeat(Math.ceil(SHEET_MAX_BYTES / 4) + 1));
    await expect(loadSheets(uri, 'CSV')).rejects.toBeInstanceOf(PreviewTooLargeError);
  });

  it('refuses a sheet with too many cells', async () => {
    const limits = { maxBytes: SHEET_MAX_BYTES, maxCells: 100 };
    const rows = Array.from({ length: 51 }, (_, i) => [`r${i}`, i]);
    const xlsx = writeWorkbook('many.xlsx', workbook({ Sheet1: rows }), 'xlsx');
    await expect(loadSheets(xlsx, 'XLSX', limits)).rejects.toBeInstanceOf(PreviewTooLargeError);
    const csv = writeFile('many.csv', rows.map((r) => r.join(',')).join('\n'));
    await expect(loadSheets(csv, 'CSV', limits)).rejects.toBeInstanceOf(PreviewTooLargeError);
    expect(SHEET_MAX_CELLS).toBe(50_000);
  });
});

// §18 W21: the viewer's read: one sheet, capped while it is parsed.
describe('loadSheetPreview', () => {
  const big = () => workbook({ Notes: [['a', 'b']], Marks: Array.from({ length: 30 }, (_, i) => [`Student ${i + 1}`, i, i % 3 ? '' : 'x']) });

  it('reads one sheet and names them all', async () => {
    const uri = writeWorkbook('two.xlsx', big(), 'xlsx');
    const first = await loadSheetPreview(uri, 'XLSX');
    expect(first).toMatchObject({ names: ['Notes', 'Marks'], index: 0, rows: [['a', 'b']], truncated: false });
    const second = await loadSheetPreview(uri, 'XLSX', 1);
    expect(second.index).toBe(1);
    expect(second.rows).toHaveLength(30);
    expect(second.rows[0]).toEqual(['Student 1', '0', 'x']);
    expect(second.truncated).toBe(false);
  });

  it('stops at the row cap and says how many rows there are', async () => {
    for (const [name, bookType, format] of [['cap.xlsx', 'xlsx', 'XLSX'], ['cap.xls', 'biff8', 'XLS']] as const) {
      const preview = await loadSheetPreview(writeWorkbook(name, big(), bookType), format, 1, 10);
      expect(preview.rows).toHaveLength(10);
      expect(preview.rows[9]).toEqual(['Student 10', '9', 'x']);
      expect(preview).toMatchObject({ truncated: true, totalRows: 30 });
    }
  });

  it('is not truncated at exactly the cap', async () => {
    const preview = await loadSheetPreview(writeWorkbook('exact.xlsx', big(), 'xlsx'), 'XLSX', 1, 30);
    expect(preview.rows).toHaveLength(30);
    expect(preview.truncated).toBe(false);
  });

  it('keeps cell positions: empty rows and columns before the data stay', async () => {
    const wb = workbook({ S: [[], [null, 'B2'], [null, null, 'C3']] });
    const preview = await loadSheetPreview(writeWorkbook('gaps.xlsx', wb, 'xlsx'), 'XLSX');
    expect(preview.rows).toEqual([
      ['', '', ''],
      ['', 'B2', ''],
      ['', '', 'C3'],
    ]);
  });

  it('reads an empty sheet, and a sheet index past the end as the last one', async () => {
    const uri = writeWorkbook('empty.xlsx', workbook({ Empty: [], Last: [['z']] }), 'xlsx');
    expect((await loadSheetPreview(uri, 'XLSX', 0)).rows).toEqual([]);
    expect(await loadSheetPreview(uri, 'XLSX', 9)).toMatchObject({ index: 1, rows: [['z']] });
  });

  it('caps a CSV the same way', async () => {
    const uri = writeFile('long.csv', Array.from({ length: 50 }, (_, i) => `${i},row`).join('\n'));
    const preview = await loadSheetPreview(uri, 'CSV', 0, 20);
    expect(preview.names).toEqual(['Sheet1']);
    expect(preview.rows).toHaveLength(20);
    expect(preview.rows[19]).toEqual(['19', 'row']);
    expect(preview.truncated).toBe(true);
    expect((await loadSheetPreview(uri, 'CSV', 0, 50)).truncated).toBe(false);
  });

  it('refuses a file over the size cap before parsing it, and has a 5,000-row cap', async () => {
    const uri = writeFile('huge.csv', 'a,b\n');
    await expect(loadSheetPreview(uri, 'CSV', 0, 10, 2)).rejects.toBeInstanceOf(PreviewTooLargeError);
    expect(SHEET_PREVIEW_ROWS).toBe(5000);
  });

  it('parses a sheet once while the file stays as it is (§18 W19)', async () => {
    const uri = writeWorkbook('cached.xlsx', big(), 'xlsx');
    const first = await cachedSheetPreview(uri, 'XLSX', 1);
    expect(await cachedSheetPreview(uri, 'XLSX', 1)).toBe(first);
    expect(await cachedSheetPreview(uri, 'XLSX', 0)).not.toBe(first);
  });
});
