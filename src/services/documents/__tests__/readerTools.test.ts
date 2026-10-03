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

  it('offers the Pro tasks each format allows', () => {
    expect(readerProTasks({ doc: scan }, allLive, allBuilt)).toEqual(['convert']);
    expect(readerProTasks({ doc: imported }, allLive, allBuilt)).toEqual(['convert', 'pdfForms']);
    expect(readerProTasks({ doc: locked }, allLive, allBuilt)).toEqual([]);
    expect(readerProTasks({ external: { format: 'PDF' } }, allLive, allBuilt)).toEqual(['convert', 'pdfForms']);
    expect(readerProTasks({ doc: docx }, allLive)).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ external: { format: 'CSV' } }, allLive)).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ doc: xls }, allLive)).toEqual(['convert']);
  });

  it('shows no Pro task until its step is built', () => {
    // §12 D5: Office → PDF is live; editing (D7) isn't yet.
    expect(readerProTasks({ doc: docx })).toEqual(['convert']);
    expect(readerProTasks({ doc: docx }, (id) => id === 'editFiles')).toEqual(['editFiles']);
    // D6 (scan/PDF → Word) isn't built: a scan has no Convert yet, even with `convert` live.
    expect(readerProTasks({ doc: scan }, allLive)).toEqual([]);
    expect(readerProTasks({ doc: imported }, allLive)).toEqual(['pdfForms']);
  });

  it('lists Convert to PDF in More for office files once `convert` is live', () => {
    expect(readerMoreItems({ doc: docx }, { proTasks: ['convert'] })).toContain('convertToPdf');
    expect(readerMoreItems({ external: { format: 'CSV' } }, { proTasks: ['convert'] })).toContain('convertToPdf');
    expect(readerMoreItems({ doc: docx })).not.toContain('convertToPdf');
    expect(readerMoreItems({ doc: scan }, { proTasks: ['convert'] })).not.toContain('convertToPdf');
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
