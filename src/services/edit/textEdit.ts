import { File, Paths } from 'expo-file-system';
import Papa from 'papaparse';
import type { ExternalFileDocument, LibraryDocument, LibraryPage } from '../../types/models';
import { createId } from '../../utils/id';
import { EXTENSION_BY_FORMAT } from '../../utils/docFormat';
import { PreviewTooLargeError, SHEET_MAX_BYTES, SHEET_MAX_CELLS } from '../documents/sheetService';
import { readTextWithEncodingFallback } from '../documents/txtService';
import { getDocumentDir } from '../persistence/libraryFiles';
import { promoteExternalToLibrary } from '../persistence/libraryOperations';

// §12 D7: editing TXT and CSV files (Pro, `editFiles`). Neither format has anything an edit could
// lose, so a library document is saved in place in the sense the plan allows: a new file is
// written beside the old one and swapped in for `contentUri` (the viewer remounts on the new uri,
// and a crash mid-write leaves the old file as it was). A file opened from outside is never
// written: the edit goes into the library as a new document, through promoteExternalToLibrary.
// Everything is written as UTF-8, whatever the file was read as (txtService's Latin-1 fallback).

export type EditFormat = 'TXT' | 'CSV';

export function isEditFormat(format: string): format is EditFormat {
  return format === 'TXT' || format === 'CSV';
}

// TXT has no cap in the viewer (it's chunked), but the editor holds the whole file in one
// TextInput, which gets slow to type in long before memory is an issue.
export const TXT_EDIT_MAX_BYTES = 1024 * 1024;

export async function loadTextForEdit(uri: string): Promise<{ text: string; fallbackUsed: boolean }> {
  const size = new File(uri).size ?? 0;
  if (size > TXT_EDIT_MAX_BYTES) throw new PreviewTooLargeError(`${size} bytes`);
  return readTextWithEncodingFallback(uri);
}

// --- CSV ---

// What a CSV is written back with: the delimiter and line ending it was read with, so a
// semicolon-separated file (common where the decimal mark is a comma) stays one.
export type CsvTable = { rows: string[][]; delimiter: string; newline: string };

export function parseCsvForEdit(text: string): CsvTable {
  // Same parse as the viewer (sheetService.loadSheets), so the grid the student edits is the one
  // they were reading. Blank lines carry nothing in a CSV and are dropped there too.
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const newline = parsed.meta.linebreak === '\r\n' || parsed.meta.linebreak === '\r' ? parsed.meta.linebreak : '\n';
  return { rows: parsed.data, delimiter: parsed.meta.delimiter || ',', newline };
}

export function csvToText(table: CsvTable): string {
  // Papa quotes a value only when it has to (the delimiter, a quote or a line break in it), and
  // doubles the quotes inside; a file that quoted every value comes back quoting only those.
  return Papa.unparse(table.rows, { delimiter: table.delimiter, newline: table.newline });
}

export async function loadCsvForEdit(uri: string): Promise<CsvTable> {
  const size = new File(uri).size ?? 0;
  if (size > SHEET_MAX_BYTES) throw new PreviewTooLargeError(`${size} bytes`);
  const table = parseCsvForEdit((await readTextWithEncodingFallback(uri)).text);
  const cells = table.rows.reduce((n, row) => n + row.length, 0);
  if (cells > SHEET_MAX_CELLS) throw new PreviewTooLargeError(`${cells} cells`);
  return table;
}

export function columnCount(rows: readonly string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

// The edits are pure and return new rows, so the editor can keep the original for "unsaved
// changes" and the grid re-renders only the rows that changed.
export function setCell(rows: readonly string[][], row: number, col: number, value: string): string[][] {
  const next = rows.slice();
  while (next.length <= row) next.push([]);
  const cells = next[row].slice();
  while (cells.length < col) cells.push('');
  cells[col] = value;
  next[row] = cells;
  return next;
}

// An empty row as wide as the table, after `after` (-1: at the top).
export function insertRow(rows: readonly string[][], after: number): string[][] {
  const width = Math.max(columnCount(rows), 1);
  const next = rows.slice();
  next.splice(Math.min(Math.max(after + 1, 0), next.length), 0, new Array<string>(width).fill(''));
  return next;
}

export function deleteRow(rows: readonly string[][], index: number): string[][] {
  if (index < 0 || index >= rows.length) return rows.slice();
  return rows.filter((_, i) => i !== index);
}

// --- Saving ---

export type EditTarget = { doc: LibraryDocument; external?: undefined } | { doc?: undefined; external: ExternalFileDocument };

export type SaveResult =
  // A library document's file was swapped: apply `patch` with library/UPDATE_FILE.
  | { kind: 'updated'; id: string; patch: Partial<LibraryDocument> }
  // A file from outside became a new library document: library/ADD_FILE, then open it.
  | { kind: 'added'; doc: LibraryDocument };

export async function saveEditedText(target: EditTarget, format: EditFormat, text: string): Promise<SaveResult> {
  const ext = EXTENSION_BY_FORMAT[format];
  if (target.external) {
    const temp = new File(Paths.cache, 'edit', `${createId('edit')}${ext}`);
    try {
      temp.write(text);
      const doc = await promoteExternalToLibrary({ ...target.external, uri: temp.uri, format, sizeBytes: temp.size ?? 0 });
      return { kind: 'added', doc };
    } finally {
      if (temp.exists) temp.delete();
    }
  }

  const doc = target.doc;
  const dir = getDocumentDir(doc.id);
  const dest = new File(dir, `document-${createId('v')}${ext}`);
  try {
    dest.write(text);
  } catch (e) {
    if (dest.exists) dest.delete();
    throw e;
  }
  // Older copies left by earlier saves go now; the one the document points at until this patch
  // is stored stays, so a crash before the database catches up still finds a file.
  pruneOldVersions(dir.list(), [fileNameOf(doc.contentUri), dest.name], ext);

  // The search text is the file's text (promoteExternalToLibrary's synthetic page), kept on the
  // same page id so bookmarks and notes on it survive.
  const page: LibraryPage = doc.pages[0]
    ? { ...doc.pages[0], ocr: { text, blocks: [] } }
    : { id: createId('page'), fileUri: '', width: 850, height: 1100, ocr: { text, blocks: [] } };
  const pages = [page, ...doc.pages.slice(1)];
  return {
    kind: 'updated',
    id: doc.id,
    patch: {
      contentUri: dest.uri,
      sizeBytes: dest.size ?? 0,
      pages,
    },
  };
}

// By name, not uri: a stored uri and a directory listing's can differ in encoding or slashes, and
// a mismatch here would delete the file the document still points at.
function fileNameOf(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  const last = uri.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function pruneOldVersions(entries: readonly unknown[], keep: readonly (string | undefined)[], ext: string): void {
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    if (!entry.name.startsWith('document') || !entry.name.endsWith(ext)) continue;
    if (keep.includes(entry.name)) continue;
    try {
      entry.delete();
    } catch (e) {
      console.warn('textEdit: could not remove an old copy', e);
    }
  }
}
