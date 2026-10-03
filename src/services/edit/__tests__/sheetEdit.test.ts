import { Directory, File, Paths } from 'expo-file-system';
import * as XLSX from 'xlsx';
import { makeDoc } from '../../../test/fixtures';
import { PreviewTooLargeError, SHEET_MAX_BYTES, SHEET_MAX_CELLS } from '../../documents/sheetService';
import { applySheetEdits, cellFromInput, editValue, loadSheetsForEdit, recordEdit, saveEditedSheet } from '../sheetEdit';

function writeWorkbook(name: string, wb: XLSX.WorkBook, bookType: 'xlsx' | 'biff8' = 'xlsx'): string {
  const file = new File(Paths.cache, 'sheet-edit-test', name);
  file.write(new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer));
  return file.uri;
}

async function readBack(uri: string): Promise<XLSX.WorkBook> {
  return XLSX.read(await new File(uri).arrayBuffer(), { type: 'array', cellFormula: true, cellNF: true });
}

// A class's marks: text, numbers, a formula, percentages, a merged title row and a second sheet.
function marksWorkbook(): XLSX.WorkBook {
  const marks = XLSX.utils.aoa_to_sheet([
    ['Class 9 marks'],
    ['Name', 'Mark', 'Share'],
    ['Asha', 91, 0.5],
    ['Rafi', 78, 0.25],
  ]);
  marks.B5 = { t: 'n', v: 169, f: 'SUM(B3:B4)' };
  marks.C3.z = '0%';
  marks.C4.z = '0%';
  marks['!ref'] = 'A1:C5';
  marks['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, marks, 'Marks');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Roll'], [12]]), 'Rolls');
  return wb;
}

describe('§12 D8 loading a workbook to edit', () => {
  it('shows cells as the viewer does, and a formula cell prompts with its formula', async () => {
    const sheets = await loadSheetsForEdit(writeWorkbook('marks.xlsx', marksWorkbook()));
    expect(sheets.map((s) => s.name)).toEqual(['Marks', 'Rolls']);
    const [marks] = sheets;
    expect(marks.rows[2]).toEqual(['Asha', '91', '50%']);
    expect(marks.rows[4][1]).toBe('169');
    expect(marks.formulas).toEqual({ B5: '=SUM(B3:B4)' });
    expect(editValue(marks, {}, marks.rows, 4, 1)).toBe('=SUM(B3:B4)');
    expect(editValue(marks, {}, marks.rows, 2, 0)).toBe('Asha');
    // The student's last input wins over the formula.
    expect(editValue(marks, recordEdit({}, 'Marks', 4, 1, '170'), marks.rows, 4, 1)).toBe('170');
  });

  it('applies the viewer caps', async () => {
    const wb = XLSX.utils.book_new();
    const rows = Array.from({ length: SHEET_MAX_CELLS / 2 + 1 }, (_, i) => [i, i]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
    await expect(loadSheetsForEdit(writeWorkbook('many.xlsx', wb))).rejects.toBeInstanceOf(PreviewTooLargeError);

    const big = new File(Paths.cache, 'sheet-edit-test', 'big.xlsx');
    big.write(new Uint8Array(SHEET_MAX_BYTES + 1));
    await expect(loadSheetsForEdit(big.uri)).rejects.toBeInstanceOf(PreviewTooLargeError);
  });
});

describe('§12 D8 typed values', () => {
  it('reads input the way a spreadsheet does', () => {
    expect(cellFromInput('')).toBeNull();
    expect(cellFromInput('Asha')).toEqual({ t: 's', v: 'Asha' });
    expect(cellFromInput('85')).toEqual({ t: 'n', v: 85 });
    expect(cellFromInput(' -2.5 ')).toEqual({ t: 'n', v: -2.5 });
    expect(cellFromInput('=SUM(B3:B4)')).toEqual({ t: 'n', f: 'SUM(B3:B4)' });
    expect(cellFromInput("'=not a formula")).toEqual({ t: 's', v: '=not a formula' });
    expect(cellFromInput("'007")).toEqual({ t: 's', v: '007' });
    expect(cellFromInput('12%')).toEqual({ t: 'n', v: 0.12, z: '0%' });
    expect(cellFromInput('=')).toEqual({ t: 's', v: '=' });
    expect(cellFromInput('1,5')).toEqual({ t: 's', v: '1,5' });
  });

  it("keeps a number's format, but not a date's", () => {
    expect(cellFromInput('9.5', { t: 'n', v: 3, z: '0.00' })).toEqual({ t: 'n', v: 9.5, z: '0.00' });
    expect(cellFromInput('5', { t: 'n', v: 45000, z: 'm/d/yy' })).toEqual({ t: 'n', v: 5 });
    expect(cellFromInput('40%', { t: 'n', v: 0.5, z: '0.0%' })).toEqual({ t: 'n', v: 0.4, z: '0.0%' });
  });

  it('grows the range for a cell written past it', () => {
    const wb = marksWorkbook();
    applySheetEdits(wb, { Marks: { A7: 'Total' } });
    expect(wb.Sheets.Marks['!ref']).toBe('A1:C7');
    applySheetEdits(wb, { Marks: { A7: '' }, Missing: { A1: 'x' } });
    expect(wb.Sheets.Marks.A7).toBeUndefined();
    expect(wb.SheetNames).toEqual(['Marks', 'Rolls']);
  });
});

describe('§12 D8 saving a copy', () => {
  it('keeps values and formulas through a round trip, and never writes the original', async () => {
    const uri = writeWorkbook('marks.xlsx', marksWorkbook());
    const before = await new File(uri).bytes();
    const doc = makeDoc({ id: 'doc_marks', name: 'Marks', format: 'XLSX', pages: [], contentUri: uri, courseId: 'c_math', docType: 'notes' });

    let edits = recordEdit({}, 'Marks', 2, 1, '95');
    edits = recordEdit(edits, 'Marks', 3, 2, '30%');
    edits = recordEdit(edits, 'Marks', 5, 1, '=AVERAGE(B3:B4)');
    edits = recordEdit(edits, 'Marks', 5, 0, "'=avg");
    edits = recordEdit(edits, 'Marks', 3, 0, '');
    const copy = await saveEditedSheet({ doc }, edits);

    expect(copy.id).not.toBe(doc.id);
    expect(copy.name).toBe('Marks (edited)');
    expect(copy.format).toBe('XLSX');
    expect(copy.courseId).toBe('c_math');
    expect(copy.docType).toBe('notes');
    expect(copy.contentUri).toMatch(/\.xlsx$/);
    expect(await new File(uri).bytes()).toEqual(before);

    const wb = await readBack(copy.contentUri!);
    const marks = wb.Sheets.Marks;
    expect(marks.A1.v).toBe('Class 9 marks');
    expect(marks.B3).toMatchObject({ t: 'n', v: 95 });
    expect(marks.C4).toMatchObject({ t: 'n', v: 0.3, z: '0%' });
    expect(marks.C3).toMatchObject({ v: 0.5, z: '0%' });
    // Untouched, with its formula; the new one is there, uncomputed.
    expect(marks.B5).toMatchObject({ f: 'SUM(B3:B4)', v: 169 });
    expect(marks.B6.f).toBe('AVERAGE(B3:B4)');
    expect(marks.A6).toMatchObject({ t: 's', v: '=avg' });
    expect(marks.A4).toBeUndefined();
    expect(marks['!ref']).toBe('A1:C6');
    expect(marks['!merges']).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]);
    expect(wb.Sheets.Rolls.A2.v).toBe(12);
    expect(new Directory(Paths.cache, 'edit').list()).toEqual([]);
  });

  it('saves an old .xls from outside as .xlsx', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Roll', 'Lab'], [12, 'done']]), 'Sheet1');
    const uri = writeWorkbook('old.xls', wb, 'biff8');
    const external = { uri, name: 'Lab', format: 'XLS' as const, sizeBytes: 1, sourceUri: 'content://x', importedAt: 1 };

    const copy = await saveEditedSheet({ external }, recordEdit({}, 'Sheet1', 1, 1, 'late'));
    expect(copy.format).toBe('XLSX');
    expect(copy.name).toBe('Lab (edited)');
    expect(copy.courseId).toBeUndefined();
    const sheets = await loadSheetsForEdit(copy.contentUri!);
    expect(sheets[0].rows).toEqual([
      ['Roll', 'Lab'],
      ['12', 'late'],
    ]);
  });
});
