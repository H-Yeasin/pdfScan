import { File, Paths } from 'expo-file-system';
import PdfNative from '../../../../modules/pdf-native';
import { makeDoc } from '../../../test/fixtures';
import { backfillPdfInfo } from '../pdfInfoBackfill';

const native = PdfNative as unknown as { getPageCount: jest.Mock; getPageSize: jest.Mock };

// pdf-lib must not be loaded to read a page size any more (§16 G4): the native module does it.
jest.mock('../../pdf/pdfService', () => {
  throw new Error('pdfInfoBackfill loaded pdfService (pdf-lib)');
});

function docWithPdf(id: string, extra: Parameters<typeof makeDoc>[0] = {}) {
  const pdf = new File(Paths.document, 'library', id, 'document.pdf');
  pdf.write('%PDF-1.7');
  return makeDoc({ id, pdfUri: pdf.uri, ...extra });
}

beforeEach(() => {
  native.getPageCount.mockReset().mockResolvedValue(1);
  native.getPageSize.mockReset().mockResolvedValue({ width: 595.28, height: 841.89 });
});

describe('backfillPdfInfo (§5 T1, native since §16 G4)', () => {
  it('reads the layout and paper from the last page, through the native module', async () => {
    const a4 = docWithPdf('a4');
    const twoUp = docWithPdf('twoUp');
    const letter = docWithPdf('letter');
    native.getPageCount.mockResolvedValue(3);
    native.getPageSize.mockImplementation(async (uri: string) =>
      uri === twoUp.pdfUri ? { width: 841.89, height: 595.28 } : uri === letter.pdfUri ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 }
    );

    expect(await backfillPdfInfo([a4, twoUp, letter])).toEqual([
      { id: 'a4', patch: { pdfLayout: 'standard', pdfPageSize: 'A4' } },
      { id: 'twoUp', patch: { pdfLayout: '2_in_1', pdfPageSize: 'A4' } },
      { id: 'letter', patch: { pdfLayout: 'standard', pdfPageSize: 'Letter' } },
    ]);
    // The last page (never the cover, which is first).
    expect(native.getPageSize).toHaveBeenCalledWith(a4.pdfUri, 2);
  });

  it('leaves alone what needs no reading', async () => {
    const docs = [
      docWithPdf('known', { pdfLayout: 'standard' }),
      docWithPdf('imported', { sourceKind: 'imported_pdf' }),
      docWithPdf('word', { format: 'DOCX' }),
      makeDoc({ id: 'noPdf', pdfUri: undefined }),
      docWithPdf('failedBefore', { pdfInfoFailed: true }),
    ];
    expect(await backfillPdfInfo(docs)).toEqual([]);
    expect(native.getPageCount).not.toHaveBeenCalled();
  });

  it('marks a PDF that is there but unreadable, so it is not opened again', async () => {
    const broken = docWithPdf('broken');
    native.getPageCount.mockRejectedValue(new Error('not a PDF'));
    const patches = await backfillPdfInfo([broken]);
    expect(patches).toEqual([{ id: 'broken', patch: { pdfInfoFailed: true } }]);

    native.getPageCount.mockClear();
    expect(await backfillPdfInfo([{ ...broken, ...patches[0].patch }])).toEqual([]);
    expect(native.getPageCount).not.toHaveBeenCalled();
  });

  it('waits for a missing file instead of marking it', async () => {
    const gone = makeDoc({ id: 'gone', pdfUri: new File(Paths.document, 'library', 'gone', 'document.pdf').uri });
    expect(await backfillPdfInfo([gone])).toEqual([]);
    expect(native.getPageCount).not.toHaveBeenCalled();
  });
});
