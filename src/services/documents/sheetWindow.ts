// §18 W21: the sheet viewer's arithmetic (components/reader/SheetView). A sheet can be 5,000 rows
// by 200 columns; the rows are a virtualised list, and of each row only the columns near the
// screen are drawn (the column window). Everything here is pure: sizes, the window, where a pinch
// leaves the scroll, cell names and Find over the cells.

export const MAX_COLUMNS = 200;
const SAMPLE_ROWS_FOR_WIDTH = 50;
const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 240;
const CHAR_WIDTH = 8;
export const CELL_FONT_SIZE = 13;
export const CELL_PADDING_H = 6;
const CELL_PADDING_V = 6;
const CELL_LINE_HEIGHT = 18;

// §18 W4: every row is exactly this tall (the row sets it, the cells' text has the matching line
// height), so the list knows where row 40,000 is without having drawn the rows before it. Whole
// points, so thousands of rows don't add up a rounding error; + 1 for the line under the row.
export function sheetLineHeight(zoom: number): number {
  return Math.round(CELL_LINE_HEIGHT * zoom);
}
export function sheetPaddingV(zoom: number): number {
  return Math.round(CELL_PADDING_V * zoom);
}
export function rowHeight(zoom: number): number {
  return sheetLineHeight(zoom) + 2 * sheetPaddingV(zoom) + 1;
}

// §12 D11: zoom scales the grid itself (font, padding, column widths), not a picture of it, so
// text stays sharp and rows stay virtualised. Steps of 0.1: §18 W21 shows a pinch as a transform
// and lays the grid out again once, when the fingers lift, at the nearest step.
export const SHEET_ZOOM_MIN = 0.6;
export const SHEET_ZOOM_MAX = 2.5;
export function sheetZoom(base: number, pinchScale: number): number {
  const z = Math.round(base * pinchScale * 10) / 10;
  return Math.min(SHEET_ZOOM_MAX, Math.max(SHEET_ZOOM_MIN, z));
}

// Computed once per sheet load and kept static rather than live-measured per cell - real
// auto-fit text measurement would defeat the list's virtualization. Also §12 D7's CSV editor.
export function computeColumnWidths(rows: readonly (readonly string[])[]): { widths: number[]; totalColumns: number } {
  const sample = rows.slice(0, SAMPLE_ROWS_FOR_WIDTH);
  const totalColumns = sample.reduce((max, row) => Math.max(max, row.length), 0);
  const colCount = Math.min(totalColumns, MAX_COLUMNS);
  const widths = new Array<number>(colCount).fill(MIN_COL_WIDTH);
  sample.forEach((row) => {
    row.slice(0, colCount).forEach((cell, i) => {
      const len = String(cell ?? '').length;
      widths[i] = Math.min(Math.max(widths[i], len * CHAR_WIDTH), MAX_COL_WIDTH);
    });
  });
  return { widths, totalColumns };
}

// The row-number column: wide enough for the last row's number.
export function gutterWidth(rowCount: number, zoom: number): number {
  const digits = String(Math.max(1, rowCount)).length;
  return Math.round((Math.max(2, digits) * CHAR_WIDTH + 2 * CELL_PADDING_H) * zoom);
}

// Where each column starts; one more entry at the end, the grid's whole width.
export function columnOffsets(widths: readonly number[]): number[] {
  const offsets = new Array<number>(widths.length + 1);
  let x = 0;
  for (let i = 0; i < widths.length; i += 1) {
    offsets[i] = x;
    x += widths[i];
  }
  offsets[widths.length] = x;
  return offsets;
}

// The column at `x` (clamped to the grid).
export function columnAt(offsets: readonly number[], x: number): number {
  const last = offsets.length - 2;
  if (last < 0) return 0;
  let low = 0;
  let high = last;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (offsets[mid] <= x) low = mid;
    else high = mid - 1;
  }
  return low;
}

export type ColumnWindow = { first: number; last: number };
// Columns kept drawn beyond each edge of the screen, so a sideways scroll has cells waiting.
export const COLUMN_OVERSCAN = 3;
// The window moves in steps of this many columns: a slow sideways scroll re-draws the rows a few
// times, not once per column edge.
export const COLUMN_STEP = 2;

// The columns to draw when the grid is scrolled to `scrollX` in a view `viewWidth` wide (both in
// the grid's own points, the row numbers not counted). Inclusive; { first: 0, last: -1 } for a
// grid with no columns.
export function columnWindow(offsets: readonly number[], scrollX: number, viewWidth: number, overscan = COLUMN_OVERSCAN, step = COLUMN_STEP): ColumnWindow {
  const count = offsets.length - 1;
  if (count <= 0) return { first: 0, last: -1 };
  const left = columnAt(offsets, Math.max(0, scrollX));
  const right = columnAt(offsets, Math.max(0, scrollX + viewWidth));
  const first = Math.max(0, Math.floor((left - overscan) / step) * step);
  const last = Math.min(count - 1, Math.ceil((right + overscan + 1) / step) * step - 1);
  return { first, last };
}

export function sameWindow(a: ColumnWindow, b: ColumnWindow): boolean {
  return a.first === b.first && a.last === b.last;
}

// A pinch ended: the scroll offset (one axis) that keeps the point under the fingers where it
// was. `focal` is the fingers' place in the view; `lead` is what lies before the scaled content
// on that axis and scales with it only as given (the row numbers, the frozen rows): its size
// before and after. `ratio`: how much the content grew.
export function focalScroll(offset: number, focal: number, ratio: number, leadBefore = 0, leadAfter = leadBefore): number {
  const inContent = offset + focal - leadBefore;
  return Math.max(0, inContent * ratio + leadAfter - focal);
}

// The offset that brings [start, start + size) into a view `view` long that is scrolled to
// `offset`, moving as little as it can; `lead` of the view's start is covered (frozen cells).
// The same offset when it is in view already.
export function scrollIntoView(offset: number, view: number, start: number, size: number, lead = 0): number {
  if (start < offset + lead) return Math.max(0, start - lead);
  if (start + size > offset + view) return Math.max(0, Math.min(start - lead, start + size - view));
  return offset;
}

// A, B, ..., Z, AA, AB, ... (0-based).
export function columnLetter(col: number): string {
  let n = Math.max(0, Math.floor(col));
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

// "C12" for row 11, column 2 (both 0-based), as a spreadsheet names it.
export function cellAddress(row: number, col: number): string {
  return `${columnLetter(col)}${Math.max(0, Math.floor(row)) + 1}`;
}

export type CellRef = { row: number; col: number };
export type CellMatches = { cells: CellRef[]; partial: boolean };
export const NO_CELL_MATCHES: CellMatches = { cells: [], partial: false };
export const SHEET_FIND_MAX = 10_000;

// Every cell that holds `query` (trimmed, any case), row by row, left to right: Find counts
// cells, not rows, and each one can be gone to. Only the columns that are shown are searched.
export function cellMatches(rows: readonly (readonly string[])[], query: string, columns: number = MAX_COLUMNS, cap: number = SHEET_FIND_MAX): CellMatches {
  const needle = query.trim().toLowerCase();
  if (!needle) return NO_CELL_MATCHES;
  const cells: CellRef[] = [];
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const width = Math.min(row.length, columns);
    for (let c = 0; c < width; c += 1) {
      const value = row[c];
      if (!value || !String(value).toLowerCase().includes(needle)) continue;
      if (cells.length >= cap) return { cells, partial: true };
      cells.push({ row: r, col: c });
    }
  }
  return { cells, partial: false };
}

// The first match at or after `from` in reading order; cells.length when there is none.
export function firstCellFrom(cells: readonly CellRef[], from: CellRef): number {
  let low = 0;
  let high = cells.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const cell = cells[mid];
    if (cell.row > from.row || (cell.row === from.row && cell.col >= from.col)) high = mid;
    else low = mid + 1;
  }
  return low;
}

// The matches in one row, as the columns they are in (for the row's tint).
export function matchedColumns(cells: readonly CellRef[], row: number): number[] {
  const out: number[] = [];
  for (let i = firstCellFrom(cells, { row, col: 0 }); i < cells.length && cells[i].row === row; i += 1) out.push(cells[i].col);
  return out;
}

// focalScroll for the columns: they are rounded to whole points one by one, so the grid doesn't
// grow by one ratio; the column under the fingers, and how far into it, is found and kept.
// `gutter`: the row numbers' width, which lies over the start of the view.
export function focalColumnScroll(
  before: readonly number[],
  after: readonly number[],
  scrollX: number,
  focal: number,
  gutterBefore: number,
  gutterAfter: number
): number {
  const count = Math.min(before.length, after.length) - 1;
  if (count <= 0) return 0;
  const x = Math.max(0, scrollX + focal - gutterBefore);
  const col = Math.min(columnAt(before, x), count - 1);
  const width = before[col + 1] - before[col];
  const into = width > 0 ? Math.min(1, (x - before[col]) / width) : 0;
  return Math.max(0, after[col] + into * (after[col + 1] - after[col]) + gutterAfter - focal);
}
