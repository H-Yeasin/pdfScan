import { makeDoc } from '../../../test/fixtures';
import type { ProTaskFeature } from '../../pro/proTask';
import { readerMoreItems, readerProTasks, readerTools } from '../readerTools';
import { DEFAULT_READING, normalizeReading, pdfViewOptions } from '../readingSettings';

const allLive = () => true;
const ids = (tools: { id: string }[]) => tools.map((t) => t.id);

describe('§12 D2 reader tool bar', () => {
  const scan = makeDoc({ pages: [makeDoc().pages[0], { ...makeDoc().pages[0], id: 'p2' }] });
  const onePageScan = makeDoc();
  const imported = makeDoc({ sourceKind: 'imported_pdf', pages: [{ id: 'p', fileUri: '', width: 850, height: 1100 }] });
  const locked = { ...imported, indexState: 'encrypted' as const };
  const docx = makeDoc({ format: 'DOCX', pages: [] });
  const xls = makeDoc({ format: 'XLS', pages: [] });

  it('puts the study tools first for a scan', () => {
    expect(ids(readerTools({ doc: scan }, { proTasks: [], isPro: false }))).toEqual(['mark', 'selectText', 'notes', 'pages']);
    // One page: nothing to scrub through.
    expect(ids(readerTools({ doc: onePageScan }, { proTasks: [], isPro: false }))).toEqual(['mark', 'selectText', 'notes']);
  });

  it('offers Mark and Select text on scans and on indexed imported PDFs', () => {
    // §12 D3: an imported PDF's pages are rendered on demand, once indexing gave them their size
    // and words (a thumbnail is written last); not when it needs a password.
    const indexed = { ...imported, pages: [{ ...imported.pages[0], thumbUri: 'thumb.jpg' }] };
    expect(ids(readerTools({ doc: indexed }, { proTasks: [], isPro: false }))).toEqual(['mark', 'selectText', 'notes']);
    // §12 D4: Notes stays, for bookmarks.
    expect(ids(readerTools({ doc: { ...indexed, indexState: 'encrypted' } }, { proTasks: [], isPro: false }))).toEqual(['notes']);
    expect(ids(readerTools({ doc: imported }, { proTasks: [], isPro: false }))).toEqual(['notes']);
    expect(ids(readerTools({ doc: docx }, { proTasks: [], isPro: false }))).toEqual([]);
    expect(ids(readerTools({ external: { format: 'PDF' } }, { proTasks: [], isPro: false }))).toEqual([]);
  });

  it('adds Convert/Edit with a Pro badge only without Pro', () => {
    const proTasks: ProTaskFeature[] = ['convert'];
    expect(readerTools({ doc: docx }, { proTasks, isPro: false })).toEqual([{ id: 'convertEdit', pro: true }]);
    expect(readerTools({ doc: docx }, { proTasks, isPro: true })).toEqual([{ id: 'convertEdit', pro: false }]);
    expect(readerTools({ doc: scan }, { proTasks, isPro: false }).every((t) => t.pro === (t.id === 'convertEdit'))).toBe(true);
  });

  const allBuilt = { officeToPdf: true, pdfToWord: true };
  const allEdits = { text: true, sheet: true, docx: true };

  it('offers the Pro tasks each format allows', () => {
    expect(readerProTasks({ doc: scan }, allLive, allBuilt)).toEqual(['convert']);
    expect(readerProTasks({ doc: imported }, allLive, allBuilt)).toEqual(['convert', 'pdfForms']);
    expect(readerProTasks({ doc: locked }, allLive, allBuilt)).toEqual([]);
    expect(readerProTasks({ external: { format: 'PDF' } }, allLive, allBuilt)).toEqual(['convert', 'pdfForms']);
    expect(readerProTasks({ doc: docx }, allLive, allBuilt, allEdits)).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ external: { format: 'CSV' } }, allLive)).toEqual(['convert', 'editFiles']);
    // An old .xls is converted, never edited.
    expect(readerProTasks({ doc: xls }, allLive, allBuilt, allEdits)).toEqual(['convert']);
  });

  it('shows no Pro task until its step is built', () => {
    // §12 D7: editing is live for TXT and CSV; XLSX (D8) and Word (D9) aren't built yet.
    expect(readerProTasks({ doc: makeDoc({ format: 'TXT' }) })).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ external: { format: 'CSV' } })).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ doc: docx })).toEqual(['convert']);
    expect(readerProTasks({ doc: makeDoc({ format: 'XLSX', pages: [] }) })).toEqual(['convert']);
    expect(readerProTasks({ doc: docx }, (id) => id === 'editFiles', allBuilt, allEdits)).toEqual(['editFiles']);
    // D6 (scan/PDF → Word) is built: a scan and a PDF have Convert once `convert` is live.
    expect(readerProTasks({ doc: scan })).toEqual(['convert']);
    expect(readerProTasks({ external: { format: 'PDF' } })).toEqual(['convert']);
    expect(readerProTasks({ doc: locked })).toEqual([]);
    // Before D6 was built, a scan had none.
    expect(readerProTasks({ doc: scan }, allLive, { officeToPdf: true, pdfToWord: false })).toEqual([]);
    expect(readerProTasks({ doc: imported }, allLive, { officeToPdf: true, pdfToWord: false })).toEqual(['pdfForms']);
  });

  it('lists Convert to PDF in More for office files once `convert` is live', () => {
    expect(readerMoreItems({ doc: docx }, { proTasks: ['convert'] })).toContain('convertToPdf');
    expect(readerMoreItems({ external: { format: 'CSV' } }, { proTasks: ['convert'] })).toContain('convertToPdf');
    expect(readerMoreItems({ doc: docx })).not.toContain('convertToPdf');
    expect(readerMoreItems({ doc: scan }, { proTasks: ['convert'] })).not.toContain('convertToPdf');
  });

  it('lists Convert to Word in More for scans and PDFs once `convert` is live', () => {
    // §12 D6.
    expect(readerMoreItems({ doc: scan }, { proTasks: ['convert'] })).toContain('convertToWord');
    expect(readerMoreItems({ external: { format: 'PDF' } }, { proTasks: ['convert'] })).toContain('convertToWord');
    expect(readerMoreItems({ doc: scan })).not.toContain('convertToWord');
    expect(readerMoreItems({ doc: docx }, { proTasks: ['convert'] })).not.toContain('convertToWord');
  });
});

describe('§12 D7 Edit in More', () => {
  it('lists Edit once `editFiles` is one of the file\'s Pro tasks', () => {
    const txt = makeDoc({ format: 'TXT' });
    expect(readerMoreItems({ doc: txt }, { proTasks: ['convert', 'editFiles'] })).toEqual([
      'share',
      'convertToPdf',
      'editFile',
      'print',
      'readingSettings',
      'changeType',
      'delete',
    ]);
    expect(readerMoreItems({ external: { format: 'CSV' } }, { proTasks: ['editFiles'] })).toContain('editFile');
    expect(readerMoreItems({ doc: txt }, { proTasks: ['convert'] })).not.toContain('editFile');
  });
});

describe('§12 D2 More sheet', () => {
  it('moves sharing and managing a scan into More, with Delete last', () => {
    expect(readerMoreItems({ doc: makeDoc() })).toEqual([
      'submit',
      'share',
      'export',
      'print',
      'sign',
      'editPages',
      'bookmarks',
      'copyText',
      'extractText',
      'readingSettings',
      'changeType',
      'delete',
    ]);
  });

  it('offers Add to Library, not Delete, for a file from outside', () => {
    expect(readerMoreItems({ external: { format: 'PDF' } })).toEqual(['addToLibrary', 'share', 'export', 'print', 'readingSettings']);
    expect(readerMoreItems({ external: { format: 'DOCX' } })).toEqual(['addToLibrary', 'share', 'print', 'readingSettings']);
  });

  it('has no page tools for an office file', () => {
    expect(readerMoreItems({ doc: makeDoc({ format: 'XLSX', pages: [] }) })).toEqual(['share', 'print', 'readingSettings', 'changeType', 'delete']);
  });
});

describe('§12 D2 reading settings', () => {
  it('reads nothing stored as the defaults', () => {
    expect(normalizeReading(undefined)).toEqual(DEFAULT_READING);
    expect(normalizeReading('paged')).toEqual(DEFAULT_READING);
  });

  it('keeps Mark mode\'s last tool (§12 D3)', () => {
    expect(normalizeReading({ mark: { tool: 'underline', lineColor: 'blue' } }).mark).toEqual({ ...DEFAULT_READING.mark, tool: 'underline', lineColor: 'blue' });
  });

  it('maps to the PDF engine props', () => {
    expect(pdfViewOptions(DEFAULT_READING)).toEqual({ enablePaging: false, fitPolicy: 0, spacing: 10 });
    expect(pdfViewOptions({ ...DEFAULT_READING, layout: 'paged', fit: 'page', spacing: 'none' })).toEqual({
      enablePaging: true,
      fitPolicy: 2,
      spacing: 0,
    });
  });
});
