import { makeDoc } from '../../../test/fixtures';
import type { ProTaskFeature } from '../../pro/proTask';
import { readerMoreItemIds, readerMoreSections, readerProTasks, readerTools, type ReaderSubject } from '../readerTools';
import { DEFAULT_READING, normalizeReading } from '../readingSettings';

const allLive = () => true;
const ids = (tools: { id: string }[]) => tools.map((t) => t.id);
const readerMoreItems = (subject: ReaderSubject) => readerMoreItemIds(readerMoreSections(subject));
const bySection = (subject: ReaderSubject) => Object.fromEntries(readerMoreSections(subject).map((s) => [s.id, s.items]));

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
    // §12 D8: an old .xls is edited too (the copy is saved as .xlsx).
    expect(readerProTasks({ doc: xls }, allLive, allBuilt, allEdits)).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ doc: xls }, allLive, allBuilt, { ...allEdits, sheet: false })).toEqual(['convert']);
  });

  it('shows no Pro task until its step is built', () => {
    // §12 D7–D9: editing is live for TXT, CSV, XLSX, XLS and Word.
    expect(readerProTasks({ doc: makeDoc({ format: 'TXT' }) })).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ external: { format: 'CSV' } })).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ doc: docx })).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ doc: docx }, allLive, allBuilt, { ...allEdits, docx: false })).toEqual(['convert']);
    expect(readerProTasks({ doc: makeDoc({ format: 'XLSX', pages: [] }) })).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ external: { format: 'XLS' } })).toEqual(['convert', 'editFiles']);
    expect(readerProTasks({ doc: docx }, (id) => id === 'editFiles', allBuilt, allEdits)).toEqual(['editFiles']);
    // D6 (scan/PDF → Word) is built: a scan and a PDF have Convert once `convert` is live.
    expect(readerProTasks({ doc: scan })).toEqual(['convert']);
    // D10: a PDF (not a scan) also has Fill in form.
    expect(readerProTasks({ external: { format: 'PDF' } })).toEqual(['convert', 'pdfForms']);
    expect(readerProTasks({ doc: imported })).toEqual(['convert', 'pdfForms']);
    expect(readerProTasks({ doc: locked })).toEqual([]);
    // Before D6 was built, a scan had none.
    expect(readerProTasks({ doc: scan }, allLive, { officeToPdf: true, pdfToWord: false })).toEqual([]);
    expect(readerProTasks({ doc: imported }, allLive, { officeToPdf: true, pdfToWord: false })).toEqual(['pdfForms']);
  });

});

describe('§18 W23 the More sheet, in sections', () => {
  const scan = makeDoc({ pages: [makeDoc().pages[0], { ...makeDoc().pages[0], id: 'p2' }] });
  const jpg = makeDoc({ format: 'JPG', pages: scan.pages });
  const imported = makeDoc({ sourceKind: 'imported_pdf', pages: [{ id: 'p', fileUri: '', width: 850, height: 1100 }] });
  const password = { ...imported, indexState: 'encrypted' as const };
  const office = makeDoc({ format: 'DOCX', pages: [] });
  const subjects: Record<string, ReaderSubject> = {
    scan: { doc: scan },
    jpg: { doc: jpg },
    imported: { doc: imported },
    password: { doc: password },
    externalPdf: { external: { format: 'PDF' } },
    externalOffice: { external: { format: 'XLSX' } },
    office: { doc: office },
  };
  // The bottom tool bar's (Convert/Edit, Fill form), the top bar's and Notes' (bookmarks) and the
  // selection's (copy a page's text).
  const elsewhere = ['convertToPdf', 'convertToWord', 'editFile', 'fillForm', 'bookmarks', 'copyText', 'export'];

  it.each(Object.keys(subjects))('lists nothing twice, nothing from the bars, Delete last: %s', (name) => {
    const subject = subjects[name];
    const items = readerMoreItems(subject);
    expect(new Set(items).size).toBe(items.length);
    const tools = ids(readerTools(subject, { proTasks: readerProTasks(subject), isPro: false }));
    for (const id of items) {
      expect(tools).not.toContain(id);
      expect(elsewhere).not.toContain(id);
    }
    if (subject.doc) expect(items[items.length - 1]).toBe('delete');
    else expect(items).not.toContain('delete');
    // Sections keep their order, and none is empty.
    const order = ['share', 'organise', 'study', 'document'];
    const sections = readerMoreSections(subject);
    expect(sections.map((s) => order.indexOf(s.id))).toEqual([...sections.map((s) => order.indexOf(s.id))].sort());
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it('groups a scan', () => {
    expect(bySection({ doc: scan })).toEqual({
      share: ['submit', 'share', 'print'],
      organise: ['rename', 'move', 'star', 'changeType', 'editPages', 'addCover', 'split', 'compress'],
      study: ['saveText'],
      document: ['sign', 'readingSettings', 'delete'],
    });
    // One page: nothing to split.
    expect(readerMoreItems({ doc: makeDoc() })).not.toContain('split');
  });

  it('shares a JPG-format document as a PDF or as its images', () => {
    expect(bySection({ doc: jpg }).share).toEqual(['submit', 'shareAsPdf', 'shareImages', 'print']);
    expect(readerMoreItems({ doc: scan })).not.toContain('shareImages');
  });

  it('gives a password-protected PDF no page tools', () => {
    expect(bySection({ doc: password })).toEqual({
      share: ['share', 'print'],
      organise: ['rename', 'move', 'star', 'changeType'],
      document: ['readingSettings', 'delete'],
    });
  });

  it('offers Add to Library and nothing to organise for a file from outside', () => {
    expect(bySection({ external: { format: 'PDF' } })).toEqual({
      share: ['share', 'print'],
      organise: ['addToLibrary'],
      document: ['readingSettings'],
    });
  });

  it('has no page tools for an office file', () => {
    expect(bySection({ doc: office })).toEqual({
      share: ['share', 'print'],
      organise: ['rename', 'move', 'star', 'changeType'],
      document: ['readingSettings', 'delete'],
    });
  });

  it('offers Add cover page on a library PDF, Change cover page once it has one (§14 Q7)', () => {
    expect(readerMoreItems({ doc: makeDoc({ coverKind: 'template' }) })).toContain('changeCover');
    expect(readerMoreItems({ doc: makeDoc({ coverKind: 'template' }) })).not.toContain('addCover');
    expect(readerMoreItems({ doc: imported })).toContain('addCover');
    const covers = (items: string[]) => items.filter((id) => id === 'addCover' || id === 'changeCover');
    expect(covers(readerMoreItems({ doc: password }))).toEqual([]);
    expect(covers(readerMoreItems({ doc: office }))).toEqual([]);
    expect(covers(readerMoreItems({ external: { format: 'PDF' } }))).toEqual([]);
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
});
