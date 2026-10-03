import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { makeDoc } from '../../../test/fixtures';
import { writeDocx, type DocxBlock } from '../../convert/docxWriter';
import { docxToHtml } from '../../documents/docxService';
import { PreviewTooLargeError } from '../../documents/sheetService';
import {
  commandScript,
  DOCX_EDIT_MAX_BYTES,
  docxBlocksFromEditor,
  docxEditorHtml,
  loadDocxForEdit,
  parseEditorMessage,
  saveEditedDocx,
  tagImages,
} from '../docxEdit';
import { decodeEntities, docxBlocksText, htmlToDocxBlocks, imageFromDataUri, imageSize, parseHtml } from '../htmlToDocx';

// A 1×1 PNG, as mammoth inlines pictures.
const PNG_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function cacheFile(name: string): File {
  const dir = new Directory(Paths.cache, 'test-docx-edit');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, name);
}

async function roundTrip(html: string, images: readonly string[] = []): Promise<string> {
  const file = cacheFile(`rt-${Math.random().toString(36).slice(2)}.docx`);
  writeDocx(file, docxBlocksFromEditor(html, images));
  return docxToHtml(file.uri);
}

describe('§12 D9 HTML → DOCX → mammoth', () => {
  it('keeps headings, paragraphs, bold, italic and line breaks', async () => {
    const html = await roundTrip(
      '<h1>Cell division</h1><h2>Mitosis</h2><h3>Prophase</h3>' +
        '<p>Chromosomes <b>condense</b> and <i>the</i> <strong><em>spindle</em></strong> forms.</p>' +
        '<p>Line one<br>Line two</p><p>H<sub>2</sub>O and x<sup>2</sup> and <s>wrong</s></p>'
    );
    expect(html).toContain('<h1>Cell division</h1>');
    expect(html).toContain('<h2>Mitosis</h2>');
    expect(html).toContain('<h3>Prophase</h3>');
    expect(html).toContain('<p>Chromosomes <strong>condense</strong> and <em>the</em> <strong><em>spindle</em></strong> forms.</p>');
    expect(html).toContain('Line one<br />Line two');
    expect(html).toContain('H<sub>2</sub>O and x<sup>2</sup> and <s>wrong</s>');
  });

  it('keeps bulleted and numbered lists, nested ones too', async () => {
    const html = await roundTrip('<ul><li>Apples</li><li>Pears<ul><li>Green</li></ul></li></ul><p>Then</p><ol><li>First</li><li>Second</li></ol>');
    expect(html).toContain('<ul><li>Apples</li><li>Pears<ul><li>Green</li></ul></li></ul>');
    expect(html).toContain('<ol><li>First</li><li>Second</li></ol>');
  });

  it('keeps tables, a header row and a column span', async () => {
    const html = await roundTrip(
      '<table><thead><tr><th>Name</th><th>Mark</th></tr></thead><tbody><tr><td><p>Asha</p></td><td>91</td></tr><tr><td colspan="2">Absent: none</td></tr></tbody></table>'
    );
    expect(html).toContain('<thead><tr><th><p>Name</p></th><th><p>Mark</p></th></tr></thead>');
    expect(html).toContain('<tr><td><p>Asha</p></td><td><p>91</p></td></tr>');
    expect(html).toContain('<td colspan="2"><p>Absent: none</p></td>');
  });

  it('keeps pictures, sent back by id or inline', async () => {
    const byId = await roundTrip('<p>Figure: <img data-img="0" alt="leaf"></p>', [PNG_DATA]);
    expect(byId).toMatch(/<img alt="leaf" src="data:image\/png;base64,/);
    const inline = await roundTrip(`<p><img src="${PNG_DATA}"></p>`);
    expect(inline).toContain('<img src="data:image/png;base64,');
    // Not from the web, not an unknown id.
    expect(await roundTrip('<p>x<img src="https://example.com/a.png"><img data-img="9"></p>')).toBe('<p>x</p>');
  });

  it('round-trips what mammoth itself wrote (a document opened, then saved unchanged)', async () => {
    const source = cacheFile('source.docx');
    const blocks: DocxBlock[] = [
      { type: 'paragraph', runs: [{ type: 'text', text: 'Notes' }], heading: 1 },
      { type: 'paragraph', runs: [{ type: 'text', text: 'Bold', bold: true }, { type: 'text', text: ' & <plain>' }] },
      { type: 'paragraph', runs: [{ type: 'text', text: 'One' }], list: { ordered: true, level: 0, instance: 1 } },
      { type: 'table', rows: [{ cells: [{ paragraphs: [{ type: 'paragraph', text: 'a' }] }, { paragraphs: [] }] }] },
    ];
    writeDocx(source, blocks);
    const first = await loadDocxForEdit(source.uri);
    expect(await roundTrip(first.html, first.images)).toBe(await docxToHtml(source.uri));
  });
});

describe('§12 D9 reading the editor HTML', () => {
  it('reads whitespace like a browser and keeps blank lines the student typed', () => {
    expect(htmlToDocxBlocks('<p>  a \n  b&nbsp;&nbsp;c </p><p><br></p><p>d</p>')).toEqual([
      { type: 'paragraph', runs: [{ type: 'text', text: 'a b  c' }] },
      { type: 'paragraph', runs: [] },
      { type: 'paragraph', runs: [{ type: 'text', text: 'd' }] },
    ]);
  });

  it('puts loose text in a paragraph and drops what is not document text', () => {
    expect(htmlToDocxBlocks('Hello <span>there</span><div>next</div><script>alert(1)</script><style>p{}</style>')).toEqual([
      { type: 'paragraph', runs: [{ type: 'text', text: 'Hello there' }] },
      { type: 'paragraph', runs: [{ type: 'text', text: 'next' }] },
    ]);
  });

  it('never throws on broken HTML', () => {
    expect(docxBlocksText(htmlToDocxBlocks('<p>a < b</i> <b>c</p>d'))).toBe('a < b c\nd');
    expect(parseHtml('<p a="1" b=\'2\' c=3 d>x').children).toEqual([{ tag: 'p', attrs: { a: '1', b: '2', c: '3', d: '' }, children: ['x'] }]);
    expect(decodeEntities('&lt;&amp;&#65;&#x42;&bogus;&#0;')).toBe('<&AB&bogus;');
  });

  it('numbers each list on its own, an item paragraph keeps its bullet', () => {
    const blocks = htmlToDocxBlocks('<ol><li>a</li></ol><ol><li><p>b</p></li></ol><ul><li>c</li></ul>');
    const lists = blocks.map((b) => (b.type === 'paragraph' ? b.list : undefined));
    expect(lists).toEqual([
      { ordered: true, level: 0, instance: 1 },
      { ordered: true, level: 0, instance: 2 },
      { ordered: false, level: 0, instance: 3 },
    ]);
  });

  it('reads picture sizes from their headers', () => {
    const png = imageFromDataUri(PNG_DATA, 'alt');
    expect(png).toMatchObject({ type: 'png', width: 1, height: 1, alt: 'alt' });
    // A JPEG with an APP0 segment, then SOF0 for 640×480.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0]);
    expect(imageSize(jpeg, 'jpeg')).toEqual({ width: 640, height: 480 });
    expect(imageSize(new Uint8Array(4), 'gif')).toEqual({ width: 0, height: 0 });
    expect(imageFromDataUri('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
  });
});

describe('§12 D9 the editor page', () => {
  it('tags each picture with an id and keeps its data', () => {
    const { html, images } = tagImages(`<p><img src="${PNG_DATA}" /><img alt="b" src="data:image/gif;base64,R0lG" /></p>`);
    expect(images).toEqual([PNG_DATA, 'data:image/gif;base64,R0lG']);
    expect(html).toContain(`<img data-img="0" src="${PNG_DATA}" />`);
    expect(html).toContain('<img alt="b" data-img="1" src="data:image/gif;base64,R0lG" />');
  });

  it('runs only its own script, with no network', () => {
    const page = docxEditorHtml('<p>x</p>', { bg: '#fff', ink: '#000', muted: '#666', edge: '#ccc', accent: '#0a0' }, 'abc123', 'Type "here"');
    expect(page).toContain("default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-abc123'");
    expect(page).toContain('<script nonce="abc123">');
    expect(page).toContain('<div id="ed" contenteditable="true" spellcheck="true"><p>x</p></div>');
    expect(page).toContain('content: "Type \\"here\\""');
    expect(page).not.toMatch(/https?:\/\//);
  });

  it('injects only known commands and accepts only known messages', () => {
    expect(commandScript('bold')).toBe('window.__pdfscan && window.__pdfscan.run("bold"); true;');
    expect(commandScript('alert(1)' as never)).toBe('true;');
    expect(parseEditorMessage('{"type":"html","html":"<p>a</p>"}')).toEqual({ type: 'html', html: '<p>a</p>' });
    expect(parseEditorMessage('{"type":"state","bold":true,"block":"h1"}')).toEqual({ type: 'state', bold: true, italic: false, block: 'h1', ul: false, ol: false });
    expect(parseEditorMessage('{"type":"html","html":3}')).toBeNull();
    expect(parseEditorMessage('{"type":"eval"}')).toBeNull();
    expect(parseEditorMessage('not json')).toBeNull();
  });
});

describe('§12 D9 saving a copy', () => {
  it('saves a new library document, searchable, in the same course, original unchanged', async () => {
    const source = cacheFile('handout.docx');
    writeDocx(source, [{ type: 'paragraph', text: 'Old text' }]);
    const before = await source.bytes();
    const doc = makeDoc({ id: 'doc_h', name: 'Handout', format: 'DOCX', pages: [], contentUri: source.uri, courseId: 'c_bio', docType: 'notes' });

    const { html, images } = await loadDocxForEdit(source.uri);
    expect(html).toBe('<p>Old text</p>');
    const copy = await saveEditedDocx({ doc }, '<h1>Handout</h1><p>New <b>text</b></p>', images);

    expect(copy.id).not.toBe(doc.id);
    expect(copy.name).toBe('Handout (edited)');
    expect(copy.format).toBe('DOCX');
    expect(copy.courseId).toBe('c_bio');
    expect(copy.docType).toBe('notes');
    expect(copy.pages[0].ocr?.text).toContain('New text');
    expect(await docxToHtml(copy.contentUri!)).toBe('<h1>Handout</h1><p>New <strong>text</strong></p>');
    expect(await source.bytes()).toEqual(before);
    expect(new Directory(Paths.cache, 'edit').list()).toEqual([]);
  });

  it('writes the numbering part and pictures only when they are used', async () => {
    const plain = cacheFile('plain.docx');
    writeDocx(plain, htmlToDocxBlocks('<p>a</p>'));
    expect(Object.keys((await JSZip.loadAsync(await plain.bytes())).files)).not.toContain('word/numbering.xml');

    const rich = cacheFile('rich.docx');
    writeDocx(rich, htmlToDocxBlocks(`<ul><li>a</li></ul><p><img src="${PNG_DATA}"></p>`));
    const zip = await JSZip.loadAsync(await rich.bytes());
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['word/numbering.xml', 'word/media/image1.png']));
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('<Default Extension="png" ContentType="image/png"/>');
  });

  it('applies the edit cap', async () => {
    const big = cacheFile('big.docx');
    big.write(new Uint8Array(DOCX_EDIT_MAX_BYTES + 1));
    await expect(loadDocxForEdit(big.uri)).rejects.toBeInstanceOf(PreviewTooLargeError);
  });
});
