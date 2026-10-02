import { File } from 'expo-file-system';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { readTextWithEncodingFallback } from './txtService';

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

  const arrayBuffer = await new File(uri).arrayBuffer();
  // Values only: no formulas, styles, HTML or macros are read - nothing here needs them.
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
  });

  let cells = 0;
  for (const name of workbook.SheetNames) {
    cells += cellKeys(workbook.Sheets[name]).length;
    if (cells > limits.maxCells) throw new PreviewTooLargeError(`more than ${limits.maxCells} cells`);
  }

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    // A sheet's declared range can reach column XFD / row 1,048,576 because of one stray
    // formatted cell; the rows are built for the cells that exist, not the declared range.
    const ref = usedRange(sheet);
    if (!ref) return { name, rows: [] };
    // Array-of-arrays (header: 1) avoids SheetJS guessing header-row keys; raw: false gives the
    // cells as the spreadsheet shows them (dates, percentages), which is what a preview wants.
    const rows = XLSX.utils.sheet_to_json<string[]>({ ...sheet, '!ref': ref }, { header: 1, raw: false, defval: '' });
    return { name, rows };
  });
}

function cellKeys(sheet: XLSX.WorkSheet): string[] {
  return Object.keys(sheet).filter((key) => key[0] !== '!');
}

function usedRange(sheet: XLSX.WorkSheet): string | null {
  const keys = cellKeys(sheet);
  if (keys.length === 0) return null;
  const end = { r: 0, c: 0 };
  for (const key of keys) {
    const { r, c } = XLSX.utils.decode_cell(key);
    end.r = Math.max(end.r, r);
    end.c = Math.max(end.c, c);
  }
  // From A1, so row and column positions in the preview match the spreadsheet's.
  return XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: end });
}
