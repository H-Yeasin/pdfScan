import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { PreviewTooLargeError, SHEET_MAX_BYTES } from '../../documents/sheetService';
import { getProTaskRunner } from '../../pro/proTask';
import { convertParams, OFFICE_TO_PDF_KIND, sourceFromParams } from '../convertTask';
import { A4, convertToPdf, escapeHtml, printHtmlFor, TXT_PRINT_MAX_BYTES } from '../toPdf';

// expo-print writes a real file in the cache, like the native print path.
jest.mock('expo-print', () => {
  const { File: MockFile, Paths: MockPaths } = jest.requireActual<typeof import('expo-file-system')>('expo-file-system');
  return {
    printAsync: jest.fn(),
    printToFileAsync: jest.fn(async () => {
      const file = new MockFile(MockPaths.cache, 'print', `${Math.random().toString(36).slice(2)}.pdf`);
      file.write('%PDF-1.4 printed');
      return { uri: file.uri, numberOfPages: 3 };
    }),
  };
});

const printToFileAsync = Print.printToFileAsync as jest.Mock;

function writeFile(name: string, content: string | Uint8Array): string {
  const file = new File(Paths.cache, 'convert', name);
  file.write(content);
  return file.uri;
}

function writeWorkbook(name: string, sheets: Record<string, unknown[][]>): string {
  const wb = XLSX.utils.book_new();
  for (const [sheet, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return writeFile(name, new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer));
}

async function writeDocx(name: string, paragraphs: string[]): Promise<string> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${xml(p)}</w:t></w:r></w:p>`).join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  );
  return writeFile(name, await zip.generateAsync({ type: 'uint8array' }));
}

const CSP = `content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"`;

beforeEach(() => printToFileAsync.mockClear());

describe('§12 D5 Office → PDF: the print HTML', () => {
  it('escapes everything that could be markup', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('prints a DOCX as its preview HTML, on white paper, under the CSP', async () => {
    const uri = await writeDocx('handout.docx', ['Week 3 handout', '<script>alert(1)</script>']);
    const { html, landscape } = await printHtmlFor({ uri, format: 'DOCX' });
    expect(landscape).toBe(false);
    expect(html).toContain(CSP);
    expect(html).toContain('<p>Week 3 handout</p>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('background: #ffffff');
    expect(html).toContain('@page');
  });

  it('prints a CSV as one table, the first row as a repeated header, every cell escaped', async () => {
    const uri = writeFile('grades.csv', 'Name,Mark\n<script>alert(1)</script>,91\nRafi\n');
    const { html, landscape } = await printHtmlFor({ uri, format: 'CSV' });
    expect(landscape).toBe(false);
    expect(html).toContain(CSP);
    expect(html).toContain('<thead><tr><th>Name</th><th>Mark</th></tr></thead>');
    expect(html).toContain('<td>&lt;script&gt;alert(1)&lt;/script&gt;</td><td>91</td>');
    expect(html).not.toContain('<script>');
    // A short row is padded, so the table stays rectangular.
    expect(html).toContain('<tr><td>Rafi</td><td></td></tr>');
    expect(html).toContain('thead { display: table-header-group; }');
    // A CSV's sheet has no name of its own.
    expect(html).not.toContain('<h2>');
  });

  it('prints each sheet of a workbook from a new page, under its name', async () => {
    const uri = writeWorkbook('marks.xlsx', { 'Term <1>': [['Name', 'Mark'], ['Asha', 91]], Term2: [['Name'], ['Rafi']] });
    const { html } = await printHtmlFor({ uri, format: 'XLSX' });
    expect(html).toContain('<section class="sheet"><h2>Term &lt;1&gt;</h2>');
    expect(html).toContain('<section class="sheet next"><h2>Term2</h2>');
    expect(html.match(/class="sheet next"/g)).toHaveLength(1);
    expect(html).toContain('page-break-before: always');
  });

  it('turns the page for a sheet with more than 8 columns', async () => {
    const narrow = writeFile('narrow.csv', 'a,b,c,d,e,f,g,h\n');
    const wide = writeFile('wide.csv', 'a,b,c,d,e,f,g,h,i\n');
    expect((await printHtmlFor({ uri: narrow, format: 'CSV' })).landscape).toBe(false);
    expect((await printHtmlFor({ uri: wide, format: 'CSV' })).landscape).toBe(true);
  });

  it('prints a TXT as preformatted, escaped text', async () => {
    const uri = writeFile('notes.txt', 'Line 1\n  indented <b>not bold</b>\n');
    const { html } = await printHtmlFor({ uri, format: 'TXT' });
    expect(html).toContain(CSP);
    expect(html).toContain('<pre>Line 1\n  indented &lt;b&gt;not bold&lt;/b&gt;\n</pre>');
    expect(html).toContain('white-space: pre-wrap');
  });

  it('passes the too-large error through', async () => {
    const bigCsv = writeFile('big.csv', 'x'.repeat(SHEET_MAX_BYTES + 1));
    await expect(printHtmlFor({ uri: bigCsv, format: 'CSV' })).rejects.toBeInstanceOf(PreviewTooLargeError);
    const bigTxt = writeFile('big.txt', 'x'.repeat(TXT_PRINT_MAX_BYTES + 1));
    await expect(printHtmlFor({ uri: bigTxt, format: 'TXT' })).rejects.toBeInstanceOf(PreviewTooLargeError);
  });

  it('refuses formats it has no converter for', async () => {
    await expect(printHtmlFor({ uri: 'file:///x.pdf', format: 'PDF' })).rejects.toThrow("Can't convert PDF");
  });
});

describe('§12 D5 Office → PDF: the library document', () => {
  it('prints on A4 and adds the PDF as a new imported document, leaving the original alone', async () => {
    const uri = writeFile('list.csv', 'Name\nAsha\n');
    const doc = await convertToPdf({ uri, name: 'Class list', format: 'CSV' });
    expect(printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({ width: A4.width, height: A4.height }));
    expect(doc).toMatchObject({ name: 'Class list', format: 'PDF', tag: 'PDF', sourceKind: 'imported_pdf', pdfLayout: 'standard' });
    expect(doc.pages).toHaveLength(3);
    expect(new File(doc.pdfUri!).textSync()).toBe('%PDF-1.4 printed');
    // The temporary print file is gone; the original is unchanged.
    const printed = (await printToFileAsync.mock.results[0].value) as { uri: string };
    expect(new File(printed.uri).exists).toBe(false);
    expect(new File(uri).textSync()).toBe('Name\nAsha\n');
  });

  it('prints a wide sheet on landscape A4', async () => {
    const uri = writeFile('wide2.csv', 'a,b,c,d,e,f,g,h,i,j\n');
    await convertToPdf({ uri, name: 'Wide', format: 'CSV' });
    expect(printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({ width: A4.height, height: A4.width }));
  });

  it('leaves nothing in the library when the file is too large', async () => {
    const library = new Directory(Paths.document, 'library');
    const before = library.exists ? library.list().length : 0;
    const uri = writeFile('huge.csv', 'x'.repeat(SHEET_MAX_BYTES + 1));
    await expect(convertToPdf({ uri, name: 'Huge', format: 'CSV' })).rejects.toBeInstanceOf(PreviewTooLargeError);
    expect(printToFileAsync).not.toHaveBeenCalled();
    expect(library.exists ? library.list().length : 0).toBe(before);
  });
});

describe('§12 D5 Office → PDF: the Pro task', () => {
  it('stores what it needs to finish after a restart, and nothing it can not run', () => {
    const source = { uri: 'file:///library/doc_1/document.docx', name: 'Handout', format: 'DOCX' as const };
    expect(sourceFromParams(convertParams(source))).toEqual(source);
    expect(sourceFromParams({ ...convertParams(source), format: 'PDF' })).toBeNull();
    expect(sourceFromParams({ name: 'x', format: 'TXT' })).toBeNull();
  });

  it('registers a runner that converts and adds the PDF to the library', async () => {
    const runner = getProTaskRunner(OFFICE_TO_PDF_KIND);
    expect(runner).toBeDefined();
    const uri = writeFile('resume.txt', 'Hello');
    const dispatch = jest.fn();
    await runner!(
      { id: 't', feature: 'convert', kind: OFFICE_TO_PDF_KIND, docId: 'doc_1', title: 'Resume', params: { uri, name: 'Resume', format: 'TXT' }, rewarded: true, createdAt: 0 },
      { store: { dispatch, getState: jest.fn(), subscribe: jest.fn() } as never }
    );
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/ADD_FILE', file: expect.objectContaining({ name: 'Resume', format: 'PDF' }) });
  });
});
