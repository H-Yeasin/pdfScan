import { File, Paths } from 'expo-file-system';
import { makeDoc, makePage } from '../../../test/fixtures';
import { makeJpeg } from '../../../test/jpeg';
import { ensureDocumentPdfOnce } from '../pdfService';

function scanWithoutPdf(id: string, masterExists = true) {
  const master = new File(Paths.document, 'library', id, 'page_1.jpg');
  if (masterExists) master.write(makeJpeg(600, 800));
  return makeDoc({ id, pdfUri: undefined, pages: [makePage({ fileUri: master.uri, width: 600, height: 800 })] });
}

describe('ensureDocumentPdfOnce (§18 W3)', () => {
  it('runs one build for two calls made at the same time', async () => {
    const doc = scanWithoutPdf('doc_once');
    const write = jest.spyOn(File.prototype, 'write');
    const first = ensureDocumentPdfOnce(doc);
    const second = ensureDocumentPdfOnce({ ...doc });
    expect(second).toBe(first);
    const [a, b] = await Promise.all([first, second]);
    expect(b).toBe(a);
    expect(a.pdfUri && new File(a.pdfUri).exists).toBe(true);
    // One document.pdf was written (through its temporary name).
    expect(write.mock.contexts.filter((file) => (file as File).name.includes('document.pdf'))).toHaveLength(1);
    write.mockRestore();
  });

  it('starts a new build after a failed one, so Retry retries', async () => {
    const doc = scanWithoutPdf('doc_retry', false);
    const failed = ensureDocumentPdfOnce(doc);
    await expect(failed).rejects.toBeDefined();
    new File(doc.pages[0].fileUri).write(makeJpeg(600, 800));
    const again = ensureDocumentPdfOnce(doc);
    expect(again).not.toBe(failed);
    expect((await again).pdfUri).toBeDefined();
  });

  it('returns a document that already has its PDF as it is', async () => {
    const doc = makeDoc({ id: 'doc_has', pdfUri: 'file:///x/document.pdf' });
    expect(await ensureDocumentPdfOnce(doc)).toBe(doc);
  });
});
