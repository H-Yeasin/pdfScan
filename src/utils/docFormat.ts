import { File } from 'expo-file-system';
import type { DocFormat } from '../types/models';

export const EXTENSION_BY_FORMAT: Record<DocFormat, string> = {
  PDF: '.pdf',
  JPG: '.jpg',
  DOCX: '.docx',
  DOC: '.doc',
  XLSX: '.xlsx',
  XLS: '.xls',
  CSV: '.csv',
  TXT: '.txt',
};

export const MIME_BY_FORMAT: Record<DocFormat, string> = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  DOC: 'application/msword',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  XLS: 'application/vnd.ms-excel',
  CSV: 'text/csv',
  TXT: 'text/plain',
};

const FORMAT_BY_EXTENSION: Record<string, DocFormat> = Object.fromEntries(
  Object.entries(EXTENSION_BY_FORMAT).map(([format, ext]) => [ext, format as DocFormat])
);

const FORMAT_BY_MIME: Record<string, DocFormat> = Object.fromEntries(
  Object.entries(MIME_BY_FORMAT).map(([format, mime]) => [mime, format as DocFormat])
);

// Legacy/alternate MIME strings some apps hand off instead of the canonical ones above.
const MIME_ALIASES: Record<string, DocFormat> = {
  'text/comma-separated-values': 'CSV',
  'application/csv': 'CSV',
};

// Best-effort format detection for an externally-opened or picked file. Tries, in order: the
// real resolved filename (works even for content:// URIs, unlike string-splitting the raw uri),
// the caller-supplied original filename/mimeType (from DocumentPicker's asset or an OS intent),
// then falls back to parsing the raw uri string. Returns null only if nothing matched - callers
// decide their own fallback (importExternalFile defaults to 'PDF' for backward compatibility).
export function detectDocFormat(uri: string, opts?: { mimeType?: string; originalFileName?: string }): DocFormat | null {
  const byResolvedName = extensionOf(new File(uri).name);
  if (byResolvedName) return byResolvedName;

  const byOriginalName = opts?.originalFileName ? extensionOf(opts.originalFileName) : null;
  if (byOriginalName) return byOriginalName;

  if (opts?.mimeType) {
    const byMime = FORMAT_BY_MIME[opts.mimeType] ?? MIME_ALIASES[opts.mimeType];
    if (byMime) return byMime;
  }

  return extensionOf(uri);
}

function extensionOf(nameOrUri: string): DocFormat | null {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(nameOrUri);
  if (!match) return null;
  return FORMAT_BY_EXTENSION[`.${match[1].toLowerCase()}`] ?? null;
}
