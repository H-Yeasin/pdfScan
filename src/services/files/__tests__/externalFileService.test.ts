import { File, Paths } from 'expo-file-system';
import PdfNative from '../../../../modules/pdf-native';
import { importExternalFile } from '../externalFileService';

// §18 W3: the count comes from pdfium. Loading pdf-lib at all (it parsed the whole file) fails
// this test.
jest.mock('pdf-lib', () => {
  throw new Error('importExternalFile must not load pdf-lib');
});

const native = PdfNative as unknown as { getPageCount: jest.Mock };

function writeSource(name: string): File {
  const file = new File(Paths.cache, 'incoming', name);
  file.write('%PDF-1.4 not a real PDF');
  return file;
}

afterEach(() => native.getPageCount.mockReset().mockResolvedValue(1));

describe('importExternalFile page count (§18 W3)', () => {
  it('asks the native module, about the copied file', async () => {
    native.getPageCount.mockResolvedValue(300);
    const ext = await importExternalFile(writeSource('notes.pdf').uri);
    expect(ext.pageCount).toBe(300);
    expect(native.getPageCount).toHaveBeenCalledWith(ext.uri);
    expect(new File(ext.uri).exists).toBe(true);
  });

  it('has no count for a password-protected PDF, and still opens it', async () => {
    native.getPageCount.mockRejectedValue(Object.assign(new Error('needs a password'), { code: 'ENCRYPTED' }));
    const ext = await importExternalFile(writeSource('locked.pdf').uri);
    expect(ext.pageCount).toBeUndefined();
    expect(ext.format).toBe('PDF');
  });

  it("doesn't ask for other formats", async () => {
    const file = new File(Paths.cache, 'incoming', 'notes.txt');
    file.write('hello');
    const ext = await importExternalFile(file.uri);
    expect(ext.pageCount).toBeUndefined();
    expect(native.getPageCount).not.toHaveBeenCalled();
  });
});
