import { File } from 'expo-file-system';
import type * as XLSXTypes from 'xlsx';
import Papa from 'papaparse';
import { createParseCache, parseKey } from './parseCache';
import { readTextWithEncodingFallback } from './txtService';

// §9 O5: SheetJS is large and only the sheet preview (and §12 D8's editor) uses it, so it's
// loaded on first use rather than at app start (Expo's Metro config doesn't inline requires).
type XLSXModule = typeof XLSXTypes;
let xlsx: XLSXModule | null = null;
export function XLSX(): XLSXModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  xlsx ??= require('xlsx') as XLSXModule;
  return xlsx;
}

// §7 R5: CSV, XLSX and XLS are preview-only. These files come from outside the app (WhatsApp,
// email, a teacher's drive), so parsing is capped before it can take the phone down: the file
// size first (nothing is parsed above it), then the number of non-empty cells.
export const SHEET_MAX_BYTES = 10 * 1024 * 1024;
export const SHEET_MAX_CELLS = 50_000;

export type SheetFormat = 'XLSX' | 'XLS' | 'CSV';
export type Sheet = { name: string; rows: string[][] };

// The file is too big to preview safely. The viewer says so instead of "couldn't open".
export class PreviewTooLargeError extends Error {
  constructor(what: string) {
    super(`Too large to preview: ${what}`);
    this.name = 'PreviewTooLargeError';
  }
}

export type SheetLimits = { maxBytes: number; maxCells: number };
const DEFAULT_LIMITS: SheetLimits = { maxBytes: SHEET_MAX_BYTES, maxCells: SHEET_MAX_CELLS };

export async function loadSheets(uri: string, format: SheetFormat, limits: SheetLimits = DEFAULT_LIMITS): Promise<Sheet[]> {
  const size = new File(uri).size ?? 0;
  if (size > limits.maxBytes) throw new PreviewTooLargeError(`${size} bytes`);

  if (format === 'CSV') {
    const { text } = await readTextWithEncodingFallback(uri);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const cells = parsed.data.reduce((n, row) => n + row.length, 0);
    if (cells > limits.maxCells) throw new PreviewTooLargeError(`${cells} cells`);
    return [{ name: 'Sheet1', rows: parsed.data }];
  }

  const workbook = await readWorkbook(uri, limits, { formulas: false });
  return workbook.SheetNames.map((name) => ({ name, rows: sheetRows(workbook.Sheets[name]) }));
}

// The capped read the viewer and §12 D8's editor share (the size was checked by the caller or is
// checked here). Values only by default: no formulas, styles, HTML or macros - the preview needs
// none of them. The editor reads formulas too, so the cells it didn't touch are written back with
// theirs, and number formats, so an edited number keeps showing as a percentage or a date.
export async function readWorkbook(
  uri: string,
  limits: SheetLimits = DEFAULT_LIMITS,
  opts: { formulas: boolean } = { formulas: false }
): Promise<XLSXTypes.WorkBook> {
  const size = new File(uri).size ?? 0;
  if (size > limits.maxBytes) throw new PreviewTooLargeError(`${size} bytes`);
  const arrayBuffer = await new File(uri).arrayBuffer();
  const workbook = XLSX().read(arrayBuffer, {
    type: 'array',
    cellFormula: opts.formulas,
    cellNF: opts.formulas,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
  });

  let cells = 0;
  for (const name of workbook.SheetNames) {
    cells += cellKeys(workbook.Sheets[name]).length;
    if (cells > limits.maxCells) throw new PreviewTooLargeError(`more than ${limits.maxCells} cells`);
  }
  return workbook;
}

// §18 W21: the viewer's own read. The 50,000-cell cap above was checked only after the whole file
// had been parsed, so a 5 MB workbook froze the app and was then refused. The preview instead
// parses one sheet at a time and stops at SHEET_PREVIEW_ROWS rows of it (SheetJS's `sheetRows`
// stops reading there; Papa's `preview` does for a CSV), says how many rows there are, and the
// viewer notes "first 5,000 rows". §12 D8's editor and the converter still read the whole file.
export const SHEET_PREVIEW_ROWS = 5000;

export type SheetPreview = {
  // Every sheet's name (the tabs), and which of them `rows` is.
  names: string[];
  index: number;
  rows: string[][];
  // The sheet has more rows than are shown; how many, when the file says (a CSV is cut off
  // without being counted).
  truncated: boolean;
  totalRows?: number;
};

export async function loadSheetPreview(uri: string, format: SheetFormat, index = 0, maxRows: number = SHEET_PREVIEW_ROWS, maxBytes: number = SHEET_MAX_BYTES): Promise<SheetPreview> {
  const file = new File(uri);
  const size = file.size ?? 0;
  if (size > maxBytes) throw new PreviewTooLargeError(`${size} bytes`);

  if (format === 'CSV') {
    const { text } = await readTextWithEncodingFallback(uri);
    // One row more than is shown, to know whether there are more.
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, preview: maxRows + 1 });
    const truncated = parsed.data.length > maxRows;
    return { names: ['Sheet1'], index: 0, rows: truncated ? parsed.data.slice(0, maxRows) : parsed.data, truncated };
  }

  const bytes = await file.arrayBuffer();
  const read = (only: number) =>
    XLSX().read(bytes, {
      type: 'array',
      // Only the sheet asked for is parsed, as arrays of cells (`dense`: no object key per cell),
      // and no further than the cap. Values only, as readWorkbook.
      sheets: only,
      sheetRows: maxRows,
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
    });
  let workbook = read(Math.max(0, index));
  const names = workbook.SheetNames;
  const at = Math.min(Math.max(0, index), names.length - 1);
  // A sheet that isn't there (a saved position from before the file changed): the last one.
  if (at >= 0 && at !== index) workbook = read(at);
  const sheet = names.length > 0 ? workbook.Sheets[names[at]] : undefined;
  if (!sheet) return { names, index: Math.max(0, at), rows: [], truncated: false };
  // When the read stopped early, `!fullref` is the sheet's whole range and `!ref` what was read.
  const full = typeof sheet['!fullref'] === 'string' ? XLSX().utils.decode_range(sheet['!fullref']) : null;
  const totalRows = full ? full.e.r + 1 : undefined;
  const rows = sheetRows(sheet);
  return { names, index: at, rows, truncated: totalRows !== undefined && totalRows > maxRows, totalRows };
}

// §18 W19 (A15): the last few sheets read, by the file as it is now (parseCache), so coming back
// to a workbook, or to a tab of it, doesn't parse it again.
const previews = createParseCache<SheetPreview>(3);

export function cachedSheetPreview(uri: string, format: SheetFormat, index = 0): Promise<SheetPreview> {
  return previews.get(parseKey(uri, index), () => loadSheetPreview(uri, format, index));
}

// Row r, column c of the result is the spreadsheet's cell at (r, c): §12 D8's editor maps its
// grid back to cell addresses this way.
export function sheetRows(sheet: XLSXTypes.WorkSheet): string[][] {
  // A sheet's declared range can reach column XFD / row 1,048,576 because of one stray
  // formatted cell; the rows are built for the cells that exist, not the declared range.
  const ref = usedRange(sheet);
  if (!ref) return [];
  // Array-of-arrays (header: 1) avoids SheetJS guessing header-row keys; raw: false gives the
  // cells as the spreadsheet shows them (dates, percentages), which is what a preview wants.
  return XLSX().utils.sheet_to_json<string[]>({ ...sheet, '!ref': ref }, { header: 1, raw: false, defval: '' });
}

function cellKeys(sheet: XLSXTypes.WorkSheet): string[] {
  return Object.keys(sheet).filter((key) => key[0] !== '!');
}

function usedRange(sheet: XLSXTypes.WorkSheet): string | null {
  // A dense sheet (loadSheetPreview) keeps its cells in rows, not under "A1" keys.
  const data = (sheet as { '!data'?: (XLSXTypes.CellObject | undefined)[][] })['!data'];
  if (data) {
    const end = { r: -1, c: -1 };
    data.forEach((row, r) => {
      if (!row) return;
      for (let c = row.length - 1; c >= 0; c -= 1) {
        if (row[c] === undefined) continue;
        end.r = r;
        end.c = Math.max(end.c, c);
        break;
      }
    });
    return end.r < 0 ? null : XLSX().utils.encode_range({ s: { r: 0, c: 0 }, e: end });
  }
  const keys = cellKeys(sheet);
  if (keys.length === 0) return null;
  const end = { r: 0, c: 0 };
  for (const key of keys) {
    const { r, c } = XLSX().utils.decode_cell(key);
    end.r = Math.max(end.r, r);
    end.c = Math.max(end.c, c);
  }
  // From A1, so row and column positions in the preview match the spreadsheet's.
  return XLSX().utils.encode_range({ s: { r: 0, c: 0 }, e: end });
}
