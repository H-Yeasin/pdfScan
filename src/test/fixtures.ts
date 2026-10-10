import { File, Paths } from 'expo-file-system';
import type { LibraryDocument, LibraryPage } from '../types/models';

export function makePage(overrides: Partial<LibraryPage> = {}): LibraryPage {
  return {
    id: `page_${Math.random().toString(36).slice(2)}`,
    fileUri: new File(Paths.document, 'library', 'x', 'page_1.jpg').uri,
    width: 1000,
    height: 1400,
    ...overrides,
  };
}

export function makeDoc(overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  const id = overrides.id ?? `doc_${Math.random().toString(36).slice(2)}`;
  return {
    id,
    name: 'Scan',
    format: 'PDF',
    mode: 'doc',
    pages: [makePage()],
    pdfUri: new File(Paths.document, 'library', id, 'document.pdf').uri,
    sizeBytes: 1234,
    createdAt: 1_700_000_000_000,
    star: false,
    locked: false,
    ...overrides,
  };
}
