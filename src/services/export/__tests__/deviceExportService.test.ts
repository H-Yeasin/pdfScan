import { Directory, File, Paths } from 'expo-file-system';
import type { LibraryDocument } from '../../../types/models';
import { exportCopyToDeviceFolder } from '../deviceExportService';

// A SAF folder stand-in: a plain folder. createFileAsync makes "<name>.<ext of the mime type>".
// The base64 calls are here only to fail the test if anything reaches for them (§16 G7).
const mockReadAsString = jest.fn();
const mockWriteAsString = jest.fn();
jest.mock('expo-file-system/legacy', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsMock = require('expo-file-system') as typeof import('expo-file-system');
  const ext: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg' };
  return {
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    readAsStringAsync: (...args: unknown[]) => mockReadAsString(...args),
    StorageAccessFramework: {
      createFileAsync: async (treeUri: string, name: string, mime: string) => {
        const file = new fsMock.File(new fsMock.Directory(treeUri), `${name}.${ext[mime] ?? 'bin'}`);
        file.create();
        return file.uri;
      },
      writeAsStringAsync: (...args: unknown[]) => mockWriteAsString(...args),
      deleteAsync: async (uri: string) => new fsMock.File(uri).delete(),
    },
  };
});
jest.mock('../../annotations/exportPdf', () => ({
  annotatedPdfFor: jest.fn(async (doc: { pdfUri?: string }) => doc.pdfUri),
}));

const folder = () => new Directory(Paths.document, 'Download', 'Scans');
const sources = () => new Directory(Paths.cache, 'deviceExport');
const names = () => folder().list().map((f) => f.name).sort();

function source(name: string, bytes: Uint8Array): File {
  const file = new File(sources(), name);
  file.write(bytes);
  return file;
}

// Bigger than one copy chunk (1 MB), with a pattern a dropped or repeated chunk would break.
function bigBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 31 + (i >> 10)) & 0xff;
  return bytes;
}

function docOf(patch: Partial<LibraryDocument>): LibraryDocument {
  return { id: 'd1', name: 'Lab 3', format: 'PDF', mode: 'doc', pages: [], sizeBytes: 0, createdAt: 1, star: false, locked: false, ...patch } as LibraryDocument;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const dir of [folder(), sources()]) {
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true });
  }
});

describe('exportCopyToDeviceFolder', () => {
  it('streams a PDF into the folder, byte for byte, without base64', async () => {
    const bytes = bigBytes(2 * 1024 * 1024 + 4321);
    const pdf = source('document.pdf', bytes);

    const result = await exportCopyToDeviceFolder(folder().uri, docOf({ pdfUri: pdf.uri }));

    expect(result).toEqual({ ok: 1, failed: 0 });
    expect(names()).toEqual(['Lab 3.pdf']);
    const copied = await new File(folder(), 'Lab 3.pdf').bytes();
    expect(copied.length).toBe(bytes.length);
    expect(Buffer.from(copied).equals(Buffer.from(bytes))).toBe(true);
    expect(mockReadAsString).not.toHaveBeenCalled();
    expect(mockWriteAsString).not.toHaveBeenCalled();
  });

  it('copies a JPG document page by page and counts a missing page as failed, leaving no empty file', async () => {
    const one = source('page_1.jpg', new Uint8Array([1, 2, 3]));
    const three = source('page_3.jpg', new Uint8Array([7, 8, 9, 10]));
    const page = (id: string, fileUri: string) => ({ id, fileUri, width: 10, height: 10 });
    const doc = docOf({
      format: 'JPG',
      pages: [page('a', one.uri), page('b', new File(sources(), 'gone.jpg').uri), page('c', three.uri)],
    });

    const result = await exportCopyToDeviceFolder(folder().uri, doc);

    expect(result).toEqual({ ok: 2, failed: 1 });
    expect(names()).toEqual(['Lab 3_1.jpg', 'Lab 3_3.jpg']);
    expect(Array.from(await new File(folder(), 'Lab 3_3.jpg').bytes())).toEqual([7, 8, 9, 10]);
    expect(mockReadAsString).not.toHaveBeenCalled();
  });
});
