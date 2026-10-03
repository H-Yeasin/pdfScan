import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import PdfNative from '../../../../modules/pdf-native';
import { makeDoc, makePage } from '../../../test/fixtures';
import type { OcrBlock, OcrBounding, PageOcr } from '../../../types/models';
import { docxToHtml, extractDocxText } from '../../documents/docxService';
import { runOcr } from '../../ocr/ocrService';
import { PdfEncryptedError } from '../../pdf/pdfNative';
import { getProTaskRunner } from '../../pro/proTask';
import { PDF_TO_WORD_KIND, wordParams, wordSourceFor, wordTargetFromParams } from '../convertTask';
import { documentXml, writeDocx, xmlText, type DocxBlock } from '../docxWriter';
import { convertToWord, docxBlocksFromPages, paragraphsFromOcr, readingLines } from '../toDocx';

jest.mock('../../ocr/ocrService', () => ({ runOcr: jest.fn(async () => undefined) }));

const mockedRunOcr = runOcr as jest.MockedFunction<typeof runOcr>;
const getPageText = PdfNative!.getPageText as jest.Mock;
const getPageCount = PdfNative!.getPageCount as jest.Mock;

// One OCR line per entry: [text, left, top, height]; width follows the text's length.
type L = [string, number, number, number];
function box(left: number, top: number, height: number, text: string): OcrBounding {
  return { left, top, width: text.length * height * 0.5, height };
}
function block(...lines: L[]): OcrBlock {
  const ls = lines.map(([text, left, top, height]) => ({ text, bounding: box(left, top, height, text) }));
  return { text: ls.map((l) => l.text).join('\n'), lines: ls, bounding: ls[0].bounding };
}
function ocr(...blocks: OcrBlock[]): PageOcr {
  return { text: blocks.map((b) => b.text).join('\n'), blocks };
}

function cacheFile(name: string): File {
  const dir = new Directory(Paths.cache, 'test-docx');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, name);
}

afterEach(() => jest.clearAllMocks());

describe('§12 D6 docxWriter', () => {
  it('writes a package mammoth opens: headings, paragraphs, line breaks', async () => {
    const file = cacheFile('round-trip.docx');
    writeDocx(file, [
      { type: 'paragraph', text: 'Photosynthesis', heading: 1 },
      { type: 'paragraph', text: 'Light reactions', heading: 2 },
      { type: 'paragraph', text: 'Plants turn light into sugar.' },
      { type: 'pageBreak' },
      { type: 'paragraph', text: 'Line one\nLine two' },
    ]);
    const html = await docxToHtml(file.uri);
    expect(html).toContain('<h1>Photosynthesis</h1>');
    expect(html).toContain('<h2>Light reactions</h2>');
    expect(html).toContain('<p>Plants turn light into sugar.</p>');
    expect(html).toContain('Line one<br />Line two');
    expect(await extractDocxText(file.uri)).toContain('Plants turn light into sugar.');
  });

  it('has every part Word needs, content types first', async () => {
    const file = cacheFile('parts.docx');
    writeDocx(file, [{ type: 'paragraph', text: 'x' }]);
    const zip = await JSZip.loadAsync(await file.bytes());
    expect(Object.keys(zip.files)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/_rels/document.xml.rels',
    ]);
    expect(await zip.file('word/styles.xml')!.async('string')).toContain('<w:name w:val="heading 1"/>');
  });

  it('escapes markup and drops characters XML forbids', async () => {
    expect(xmlText('a < b && "c" > d')).toBe('a &lt; b &amp;&amp; &quot;c&quot; &gt; d');
    // NUL, a vertical tab, U+FFFF and a lone surrogate would make Word refuse the file.
    expect(xmlText('ok\u0000\u000b￿\ud800!')).toBe('ok!');
    // Pairs (emoji) and Bangla stay.
    expect(xmlText('বাংলা 😀')).toBe('বাংলা 😀');

    const file = cacheFile('escaped.docx');
    writeDocx(file, [{ type: 'paragraph', text: '<script>alert(1)</script> & \u0001done' }]);
    const html = await docxToHtml(file.uri);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; done');
    expect(html).not.toContain('<script>');
  });

  it('writes tabs and page breaks as their own elements', () => {
    const blocks: DocxBlock[] = [{ type: 'paragraph', text: 'a\tb' }, { type: 'pageBreak' }];
    const xml = documentXml(blocks);
    expect(xml).toContain('<w:t xml:space="preserve">a</w:t><w:tab/><w:t xml:space="preserve">b</w:t>');
    expect(xml).toContain('<w:br w:type="page"/>');
  });
});

describe('§12 D6 lines and paragraphs', () => {
  it('joins lines OCR split on the same row, not lines one under the other', () => {
    const page = ocr(block(['Name:', 100, 100, 20]), block(['Rahim', 200, 102, 20]), block(['Roll: 12', 100, 130, 20]));
    expect(readingLines(page).map((l) => l.text)).toEqual(['Name: Rahim', 'Roll: 12']);
  });

  it('groups lines into paragraphs by block and by the gap between them', () => {
    const page = ocr(
      block(['The first paragraph runs', 100, 100, 20], ['over two lines.', 100, 126, 20], ['A gap follows.', 100, 190, 20]),
      block(['A new block.', 100, 216, 20])
    );
    expect(paragraphsFromOcr(page)).toEqual([
      { type: 'paragraph', text: 'The first paragraph runs over two lines.' },
      { type: 'paragraph', text: 'A gap follows.' },
      { type: 'paragraph', text: 'A new block.' },
    ]);
  });

  it('marks clearly taller lines as headings', () => {
    const page = ocr(
      block(['Chapter 3', 100, 40, 44]),
      block(['Cell division', 100, 110, 30]),
      block(['Mitosis has four', 100, 160, 20], ['phases in all.', 100, 186, 20], ['Each one matters.', 100, 212, 20])
    );
    expect(paragraphsFromOcr(page)).toEqual([
      { type: 'paragraph', text: 'Chapter 3', heading: 1 },
      { type: 'paragraph', text: 'Cell division', heading: 2 },
      { type: 'paragraph', text: 'Mitosis has four phases in all. Each one matters.' },
    ]);
  });

  it('mends words broken with a hyphen at the end of a line', () => {
    const page = ocr(block(['Plants need infor-', 100, 100, 20], ['mation and Covid-', 100, 126, 20], ['19 data.', 100, 152, 20]));
    expect(paragraphsFromOcr(page)).toEqual([{ type: 'paragraph', text: 'Plants need information and Covid- 19 data.' }]);
  });

  it('starts a new paragraph when the text jumps up to the next column', () => {
    const page = ocr(block(['Left column end.', 100, 900, 20], ['Right column top.', 600, 100, 20]));
    expect(paragraphsFromOcr(page).map((b) => b.type === 'paragraph' && b.text)).toEqual(['Left column end.', 'Right column top.']);
  });

  it('splits text without boxes at its blank lines', () => {
    expect(paragraphsFromOcr({ text: 'one\ntwo\n\nthree', blocks: [] })).toEqual([
      { type: 'paragraph', text: 'one two' },
      { type: 'paragraph', text: 'three' },
    ]);
  });

  it('puts a page break between pages and a line for a page with no text', () => {
    expect(docxBlocksFromPages([ocr(block(['Hello', 0, 0, 20])), undefined])).toEqual([
      { type: 'paragraph', text: 'Hello' },
      { type: 'pageBreak' },
      { type: 'paragraph', text: 'Page 2: no text found' },
    ]);
  });
});

describe('§12 D6 convertToWord', () => {
  const words = (text: string) => ({
    width: 612,
    height: 792,
    text,
    words: text.split(' ').map((w, i) => ({ text: w, left: 72 + i * 40, top: 72, width: 36, height: 12 })),
  });

  it('turns a scan into a searchable DOCX in the library, running OCR on a page that has none', async () => {
    mockedRunOcr.mockResolvedValueOnce(ocr(block(['Recognised now', 0, 0, 20])));
    const doc = makeDoc({ name: 'Bio notes', format: 'JPG', pages: [makePage({ ocr: ocr(block(['Already read', 0, 0, 20])) }), makePage()] });
    const progress = jest.fn();
    const result = await convertToWord({ kind: 'library', doc, script: 'latin' }, progress);

    expect(result).toMatchObject({ name: 'Bio notes', format: 'DOCX', tag: 'DOCX' });
    expect(result.pages[0].ocr?.text).toContain('Already read');
    expect(result.pages[0].ocr?.text).toContain('Recognised now');
    expect(mockedRunOcr).toHaveBeenCalledTimes(1);
    expect(mockedRunOcr).toHaveBeenCalledWith(doc.pages[1].fileUri, 'latin');
    expect(progress).toHaveBeenLastCalledWith({ done: 1, total: 2 });
    // The temporary file is gone; the library copy opens.
    expect(new Directory(Paths.cache, 'convert').list().filter((f) => f.name.endsWith('.docx'))).toEqual([]);
    expect(await docxToHtml(result.contentUri!)).toContain('<p>Already read</p>');
  });

  it("reads an imported PDF's pages: the stored text, else the page's text layer", async () => {
    getPageText.mockResolvedValueOnce(words('Fresh from the PDF'));
    const doc = makeDoc({
      sourceKind: 'imported_pdf',
      pages: [makePage({ fileUri: '', ocr: ocr(block(['Indexed text', 0, 0, 20])) }), makePage({ fileUri: '' })],
    });
    const result = await convertToWord({ kind: 'library', doc, script: 'latin' });
    expect(getPageText).toHaveBeenCalledTimes(1);
    expect(getPageText).toHaveBeenCalledWith(doc.pdfUri, 1);
    expect(result.pages[0].ocr?.text).toContain('Indexed text');
    expect(result.pages[0].ocr?.text).toContain('Fresh from the PDF');
  });

  it('converts a PDF from outside page by page, and stops at a password', async () => {
    getPageCount.mockResolvedValueOnce(2);
    getPageText.mockResolvedValueOnce(words('Page one')).mockResolvedValueOnce(words('Page two'));
    const result = await convertToWord({ kind: 'pdfFile', uri: 'file:///external-open/x/source.pdf', name: 'Handout', script: 'latin' });
    expect(result.name).toBe('Handout');
    expect(result.pages[0].ocr?.text).toBe('Page one\n\nPage two');

    getPageCount.mockResolvedValueOnce(1);
    getPageText.mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'ENCRYPTED' }));
    await expect(convertToWord({ kind: 'pdfFile', uri: 'file:///locked.pdf', name: 'Locked', script: 'latin' })).rejects.toBeInstanceOf(
      PdfEncryptedError
    );
  });
});

describe('§12 D6 the Pro task', () => {
  const state = (files: ReturnType<typeof makeDoc>[]) =>
    ({ library: { files, courses: [] }, settings: { ocrScript: 'latin' } }) as unknown as Parameters<typeof wordSourceFor>[1];

  it('stores what it needs to finish after a restart', () => {
    expect(wordTargetFromParams(wordParams({ docId: 'doc_1' }))).toEqual({ docId: 'doc_1' });
    expect(wordTargetFromParams(wordParams({ uri: 'file:///a.pdf', name: 'A' }))).toEqual({ uri: 'file:///a.pdf', name: 'A' });
    expect(wordTargetFromParams({ name: 'A' })).toBeNull();
    // A document deleted since: nothing to run.
    expect(wordSourceFor({ docId: 'gone' }, state([]))).toBeNull();
  });

  it('registers a runner that converts and adds the DOCX to the library', async () => {
    const doc = makeDoc({ id: 'doc_1', name: 'Notes', pages: [makePage({ ocr: ocr(block(['Hi', 0, 0, 20])) })] });
    const runner = getProTaskRunner(PDF_TO_WORD_KIND);
    expect(runner).toBeDefined();
    const dispatch = jest.fn();
    await runner!(
      { id: 't', feature: 'convert', kind: PDF_TO_WORD_KIND, docId: 'doc_1', title: 'Notes', params: { docId: 'doc_1' }, rewarded: true, createdAt: 0 },
      { store: { dispatch, getState: () => state([doc]), subscribe: jest.fn() } as never }
    );
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/ADD_FILE', file: expect.objectContaining({ name: 'Notes', format: 'DOCX' }) });
  });
});
