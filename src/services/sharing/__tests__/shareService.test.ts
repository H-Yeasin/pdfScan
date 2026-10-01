import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { shareAs, shareDocument, shareFileName } from '../shareService';
import type { LibraryDocument } from '../../../types/models';

jest.mock('expo-print', () => ({ printAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const shareAsync = Sharing.shareAsync as jest.Mock;

function libraryFile(name: string, content: string): string {
  const file = new File(Paths.document, 'library', 'doc_1', name);
  file.write(content);
  return file.uri;
}

beforeEach(() => shareAsync.mockClear());

describe('shareAs', () => {
  it('shares a copy under the given name', async () => {
    const source = libraryFile('document.pdf', 'pdf bytes');
    await shareAs(source, 'HW3.pdf', 'application/pdf');

    const [uri, options] = shareAsync.mock.calls[0];
    expect(uri).toBe(new File(Paths.cache, 'share', 'HW3.pdf').uri);
    expect(new File(uri).textSync()).toBe('pdf bytes');
    expect(options).toEqual({ mimeType: 'application/pdf', dialogTitle: 'HW3.pdf' });
    expect(new File(source).exists).toBe(true);
  });

  it('replaces a copy with the same name and clears the previous share', async () => {
    await shareAs(libraryFile('a.pdf', 'old'), 'HW3.pdf', 'application/pdf');
    await shareAs(libraryFile('b.pdf', 'other'), 'Lab1.pdf', 'application/pdf');
    await shareAs(libraryFile('c.pdf', 'new'), 'HW3.pdf', 'application/pdf');

    const names = new Directory(Paths.cache, 'share').list().map((entry) => entry.name);
    expect(names).toEqual(['HW3.pdf']);
    expect(new File(Paths.cache, 'share', 'HW3.pdf').textSync()).toBe('new');
  });
});

describe('shareFileName', () => {
  it('cleans the name and falls back when nothing is left', () => {
    expect(shareFileName('CSE101: HW3', 'pdf')).toBe('CSE101 HW3.pdf');
    expect(shareFileName('???', 'pdf')).toBe('document.pdf');
    expect(shareFileName('HW3', 'jpg', '_1')).toBe('HW3_1.jpg');
  });
});

describe('shareDocument', () => {
  const base = { id: 'doc_1', createdAt: 0, sizeBytes: 0, star: false, tag: '', locked: false, searchHaystack: '' };

  it('shares a PDF under the document name', async () => {
    const doc = { ...base, name: '2021331045_Rahim_CSE101_HW3', format: 'PDF', pages: [], pdfUri: libraryFile('document.pdf', 'x') };
    await shareDocument(doc as unknown as LibraryDocument);
    expect(shareAsync.mock.calls[0][0]).toMatch(/\/share\/2021331045_Rahim_CSE101_HW3\.pdf$/);
  });

  it('numbers the first page of a multi-page JPG document', async () => {
    const page = (n: number) => ({ id: `p${n}`, fileUri: libraryFile(`page_${n}.jpg`, 'jpg'), width: 1, height: 1 });
    const doc = { ...base, name: 'Board notes', format: 'JPG', pages: [page(1), page(2)] };
    await shareDocument(doc as unknown as LibraryDocument);
    expect(shareAsync.mock.calls[0][0]).toMatch(/\/share\/Board notes_1\.jpg$/);
  });
});
