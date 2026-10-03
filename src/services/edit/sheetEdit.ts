import { File, Paths } from 'expo-file-system';
import type * as XLSXTypes from 'xlsx';
import { t } from '../../i18n';
import type { LibraryDocument } from '../../types/models';
import { createId } from '../../utils/id';
import { readWorkbook, sheetRows, XLSX } from '../documents/sheetService';
import { promoteExternalToLibrary } from '../persistence/libraryOperations';
import type { EditTarget } from './textEdit';

// §12 D8: editing the cells of an XLSX or XLS file (Pro, `editFiles`, D7's session rule). Unlike a
// TXT or CSV, a workbook has things the edit can lose: SheetJS (community edition) reads no
// styles, charts, images or pivot tables, and computes no formulas. So the edit always goes into a
// new library document ("<name> (edited)", always .xlsx, an old .xls too) and the original is
// never written; the editor warns before saving. What the edit keeps: every sheet, every cell's
// value and formula (cells the student didn't touch are written back as they were read), number
// formats, merged cells and column widths.

export type SheetEditFormat = 'XLSX' | 'XLS';

export function isSheetEditFormat(format: string): format is SheetEditFormat {
  return format === 'XLSX' || format === 'XLS';
}

// What the editor shows: the cells as the viewer shows them, plus what a cell's edit prompt
// starts from where that differs - its formula, as "=SUM(B2:B9)".
export type EditableSheet = { name: string; rows: string[][]; formulas: Record<string, string> };

// The student's input per sheet name and cell address ("B4"), exactly as typed. Only the cells in
// here change; an empty string clears the cell.
export type SheetEdits = Record<string, Record<string, string>>;

export async function loadSheetsForEdit(uri: string): Promise<EditableSheet[]> {
  // The viewer's caps (sheetService), so whatever the Reader could show can be edited.
  const workbook = await readWorkbook(uri, undefined, { formulas: true });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const formulas: Record<string, string> = {};
    for (const [address, cell] of Object.entries(sheet)) {
      if (address[0] === '!') continue;
      const f = (cell as XLSXTypes.CellObject).f;
      if (f) formulas[address] = `=${f}`;
    }
    return { name, rows: sheetRows(sheet), formulas };
  });
}

// sheetService.sheetRows puts the cell at (r, c) in rows[r][c], so the grid's position is the
// cell's address.
export function cellAddress(row: number, col: number): string {
  return XLSX().utils.encode_cell({ r: row, c: col });
}

// What a cell's edit prompt starts from: the student's last input, else its formula, else the
// cell as shown.
export function editValue(sheet: EditableSheet, edits: SheetEdits, rows: readonly string[][], row: number, col: number): string {
  const address = cellAddress(row, col);
  return edits[sheet.name]?.[address] ?? sheet.formulas[address] ?? rows[row]?.[col] ?? '';
}

export function recordEdit(edits: SheetEdits, sheet: string, row: number, col: number, value: string): SheetEdits {
  return { ...edits, [sheet]: { ...edits[sheet], [cellAddress(row, col)]: value } };
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const PERCENT = /^([-+]?(\d+\.?\d*|\.\d+))\s*%$/;

// A typed value as a cell, the way a spreadsheet takes it: "=…" is a formula, a plain number is
// a number (so the sums over it still work), "12%" is 0.12 shown as a percentage, a leading
// apostrophe keeps the rest as text ("'=not a formula", "'007"), and anything else is text.
// `previous` is the cell being replaced: a number keeps its number format (currency, decimals),
// unless that was a date's, which would turn "5" into 5 January 1900.
export function cellFromInput(input: string, previous?: XLSXTypes.CellObject): XLSXTypes.CellObject | null {
  if (input === '') return null;
  if (input.startsWith("'")) return { t: 's', v: input.slice(1) };
  // No cached value: SheetJS doesn't compute formulas. Excel and Sheets work it out on open.
  if (input.length > 1 && input.startsWith('=')) return { t: 'n', f: input.slice(1) };
  const trimmed = input.trim();
  const percent = PERCENT.exec(trimmed);
  if (percent) {
    const z = typeof previous?.z === 'string' && previous.z.includes('%') ? previous.z : '0%';
    return { t: 'n', v: Number(percent[1]) / 100, z };
  }
  if (NUMBER.test(trimmed)) {
    const z = previous?.t === 'n' && previous.z !== undefined && !XLSX().SSF.is_date(previous.z) ? previous.z : undefined;
    return z === undefined ? { t: 'n', v: Number(trimmed) } : { t: 'n', v: Number(trimmed), z };
  }
  return { t: 's', v: input };
}

// Applies the edits to a workbook read with formulas (readWorkbook's `formulas: true`), in place.
// A sheet's range grows to take a cell written past it (a row the student added).
export function applySheetEdits(workbook: XLSXTypes.WorkBook, edits: SheetEdits): void {
  const { utils } = XLSX();
  for (const [name, cells] of Object.entries(edits)) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    for (const [address, input] of Object.entries(cells)) {
      const next = cellFromInput(input, sheet[address] as XLSXTypes.CellObject | undefined);
      if (next) sheet[address] = next;
      else delete sheet[address];
      if (!next) continue;
      const at = utils.decode_cell(address);
      const range = sheet['!ref'] ? utils.decode_range(sheet['!ref']) : { s: at, e: at };
      range.s = { r: Math.min(range.s.r, at.r), c: Math.min(range.s.c, at.c) };
      range.e = { r: Math.max(range.e.r, at.r), c: Math.max(range.e.c, at.c) };
      sheet['!ref'] = utils.encode_range(range);
    }
  }
}

export function sheetCopyName(name: string): string {
  return t('reader.editFile.copyName', { name });
}

// Reads the file again (the editor holds only what it shows), applies the edits and saves the
// result as a new library document. A library document's copy stays in its course, with its type.
export async function saveEditedSheet(target: EditTarget, edits: SheetEdits): Promise<LibraryDocument> {
  const source = target.doc ? { uri: target.doc.contentUri, name: target.doc.name } : target.external;
  if (!source.uri) throw new Error('saveEditedSheet: the document has no file');
  const workbook = await readWorkbook(source.uri, undefined, { formulas: true });
  applySheetEdits(workbook, edits);
  const out = XLSX().write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;

  const temp = new File(Paths.cache, 'edit', `${createId('edit')}.xlsx`);
  try {
    temp.write(new Uint8Array(out));
    const doc = await promoteExternalToLibrary({
      uri: temp.uri,
      name: sheetCopyName(source.name),
      format: 'XLSX',
      sizeBytes: temp.size ?? 0,
      sourceUri: temp.uri,
      importedAt: Date.now(),
    });
    return target.doc ? { ...doc, courseId: target.doc.courseId, docType: target.doc.docType } : doc;
  } finally {
    if (temp.exists) temp.delete();
  }
}
