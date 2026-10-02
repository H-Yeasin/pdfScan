import { File, Paths } from 'expo-file-system';
import * as XLSX from 'xlsx';
import { loadSheets, PreviewTooLargeError, SHEET_MAX_BYTES, SHEET_MAX_CELLS } from '../sheetService';

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
