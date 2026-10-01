import { File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { makePng } from '../../../test/png';
import { renderPage } from '../../enhance/skiaEnhance';
import { buildPdfFromPages, encodingForQuality } from '../pdfService';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));

function writePage(name: string): string {
  const file = new File(Paths.cache, name);
  file.write(makePng(20, 28));
  return file.uri;
}

beforeEach(() => jest.mocked(renderPage).mockClear());

describe('page image encoding', () => {
  it('embeds as-is pages without re-encoding them', async () => {
    const pages = [1, 2, 3].map((i) => ({ uri: writePage(`p${i}.png`), width: 20, height: 28 }));
    const { uri } = await buildPdfFromPages('doc_asis', pages, 'as-is');
    expect(renderPage).not.toHaveBeenCalled();
    const pdf = await PDFDocument.load(await new File(uri).bytes());
    expect(pdf.getPageCount()).toBe(3);
  });

  it('encodes each page exactly once at the export preset', async () => {
    jest.mocked(renderPage).mockImplementation(async (uri) => {
      const copy = new File(Paths.cache, `render_${Math.random()}.png`);
      new File(uri).copySync(copy);
      return { uri: copy.uri, width: 20, height: 28 };
    });
    const pages = [1, 2].map((i) => ({ uri: writePage(`q${i}.png`), width: 20, height: 28 }));
    await buildPdfFromPages('doc_q2', pages, encodingForQuality(2));

    expect(renderPage).toHaveBeenCalledTimes(2);
    expect(jest.mocked(renderPage).mock.calls[0][2]).toMatchObject({ maxDim: 1400, q: 0.65 });
  });

  it('treats quality 5 as as-is', () => {
    expect(encodingForQuality(5)).toBe('as-is');
  });
});
