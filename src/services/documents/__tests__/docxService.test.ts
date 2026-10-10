import { File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { docxPageHtml, docxToHtml, extractDocxText } from '../docxService';
import { promoteExternalToLibrary } from '../../persistence/libraryOperations';
import { searchDocuments } from '../../search/searchService';

// The smallest DOCX Word and mammoth agree on: content types, the package relationship and a body.
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
  const file = new File(Paths.cache, 'docx', name);
  file.write(await zip.generateAsync({ type: 'uint8array' }));
  return file.uri;
}

describe('DOCX preview', () => {
  it('extracts the text for search', async () => {
    const uri = await writeDocx('essay.docx', ['Photosynthesis essay', 'Chlorophyll absorbs light.']);
    expect(await extractDocxText(uri)).toBe('Photosynthesis essay\n\nChlorophyll absorbs light.');
  });

  it('converts to HTML, escaping the document text', async () => {
    const uri = await writeDocx('html.docx', ['<script>alert(1)</script>']);
    const html = await docxToHtml(uri);
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('wraps the body in a page whose CSP allows no scripts or network', () => {
    const page = docxPageHtml('<p>Hi</p>', { bg: '#fff', ink: '#000', muted: '#666', edge: '#ccc', accent: '#07f' });
    expect(page).toContain(`content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"`);
    expect(page).toContain('<body><p>Hi</p></body>');
  });

  it('leaves room for the top bar above the first line (§18 W4)', () => {
    const colors = { bg: '#fff', ink: '#000', muted: '#666', edge: '#ccc', accent: '#07f' };
    expect(docxPageHtml('<p>Hi</p>', colors)).toContain('padding: 20px 18px 48px;');
    expect(docxPageHtml('<p>Hi</p>', colors, { padTop: 68.4 })).toContain('padding: 88px 18px 48px;');
    // Only a length reaches the style sheet.
    const odd = docxPageHtml('<p>Hi</p>', colors, { padTop: '0; } body { display: none' as unknown as number });
    expect(odd).toContain('padding: 20px 18px 48px;');
    expect(docxPageHtml('<p>Hi</p>', colors, { padTop: -40 })).toContain('padding: 20px 18px 48px;');
  });

  it('leaves room for all four bars and edges (§18 W22)', () => {
    const colors = { bg: '#fff', ink: '#000', muted: '#666', edge: '#ccc', accent: '#07f' };
    expect(docxPageHtml('<p>Hi</p>', colors, { pad: { top: 60, bottom: 52 } })).toContain('padding: 80px 18px 100px;');
    expect(docxPageHtml('<p>Hi</p>', colors, { pad: { top: 60, bottom: 52, left: 30, right: 0 } })).toContain('padding: 80px 18px 100px 48px;');
    const odd = docxPageHtml('<p>Hi</p>', colors, { pad: { bottom: '1px; } body { display: none' as unknown as number } });
    expect(odd).toContain('padding: 20px 18px 48px;');
  });

  it('carries the night palette, switched by the body class (§18 W22)', () => {
    const day = { bg: '#fff', ink: '#000', muted: '#666', edge: '#ccc', accent: '#07f' };
    const dark = { bg: '#111', ink: '#eee', muted: '#999', edge: '#333', accent: '#4c8' };
    const find = { fill: '#efe', current: '#0a0', onCurrent: '#fff' };
    const nightFind = { fill: '#242', current: '#4c8', onCurrent: '#000' };
    const plain = docxPageHtml('<p>x</p>', day);
    expect(plain).not.toContain('body.night');
    expect(plain).not.toContain('mark.pdfscan-find');

    const page = docxPageHtml('<p>x</p>', day, { find, night: { on: false, colors: dark, find: nightFind } });
    expect(page).toContain('body { background: #fff; color: #000;');
    expect(page).toContain('body.night { background: #111; color: #eee; }');
    expect(page).toContain('body.night a { color: #4c8; }');
    expect(page).toContain('mark.pdfscan-current { background: #0a0; color: #fff; }');
    expect(page).toContain('body.night mark.pdfscan-current { background: #4c8; color: #000; }');
    expect(page).toContain('<body><p>x</p></body>');
    // Still no scripts of the document's own.
    expect(page).toContain("default-src 'none'");

    expect(docxPageHtml('<p>x</p>', day, { night: { on: true, colors: dark } })).toContain('<body class="night"><p>x</p></body>');
  });

  it('puts the text into the page text when a DOCX joins the library', async () => {
    const uri = await writeDocx('lab.docx', ['Titration lab report']);
    const doc = await promoteExternalToLibrary({ uri, name: 'Lab', format: 'DOCX', sizeBytes: 1, sourceUri: uri, importedAt: 1 });
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].ocr?.text).toBe('Titration lab report');
    expect(searchDocuments([doc], 'titration')).toEqual([doc]);
  });

  it('still adds a DOCX it cannot read, found by name', async () => {
    const file = new File(Paths.cache, 'docx', 'broken.docx');
    file.write('not a zip');
    const doc = await promoteExternalToLibrary({ uri: file.uri, name: 'Broken', format: 'DOCX', sizeBytes: 9, sourceUri: file.uri, importedAt: 1 });
    expect(doc.pages).toEqual([]);
    expect(searchDocuments([doc], 'broken')).toEqual([doc]);
  });
});
