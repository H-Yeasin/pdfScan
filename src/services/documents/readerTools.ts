import type { DocFormat, LibraryDocument } from '../../types/models';
import { getProFeature } from '../pro/proFeatures';
import type { ProTaskFeature } from '../pro/proTask';
import {
  canConvertToPdf,
  canMark,
  canSign,
  canSubmit,
  canUsePageTools,
  hasPageMasters,
  isPageRasterFormat,
  isPdfLevel,
} from './formatCapabilities';

// §12 D2: which actions the Reader shows, and where. Study actions sit in the bottom tool bar, one
// tap away; managing the file (share, sign, export, print, submit, edit pages, type, delete) is in
// More. Pure, so the rules per format and Pro state are tested without rendering the Reader.

export type ReaderToolId = 'mark' | 'selectText' | 'notes' | 'pages' | 'convertEdit';
// `pro`: show the Pro badge (the tool runs a Pro task, and the student has no day pass).
export type ReaderTool = { id: ReaderToolId; pro: boolean };

export type ReaderMoreItemId =
  | 'addToLibrary'
  | 'submit'
  | 'share'
  | 'export'
  // §12 D5: Office → PDF (Pro), also from the tool bar's Convert.
  | 'convertToPdf'
  // §12 D6: scan/PDF → Word (Pro), also from the tool bar's Convert.
  | 'convertToWord'
  // §12 D7: edit a TXT or CSV file (Pro), also from the tool bar's Convert/Edit.
  | 'editFile'
  | 'print'
  | 'sign'
  | 'editPages'
  | 'bookmarks'
  | 'copyText'
  | 'extractText'
  | 'readingSettings'
  | 'changeType'
  | 'delete';

// What the Reader has open: a library document, or a file from outside (not in the library yet).
export type ReaderSubject = { doc: LibraryDocument; external?: undefined } | { doc?: undefined; external: { format: DocFormat } };

function formatOf(subject: ReaderSubject): DocFormat {
  return subject.doc ? subject.doc.format : subject.external.format;
}

const isLiveFeature = (id: ProTaskFeature) => getProFeature(id).status === 'live';

// `convert` covers two conversions built in different steps: Office → PDF (D5) and scan/PDF → Word
// (D6). Both are built; kept so the rules per format stay testable on their own.
export const BUILT_CONVERSIONS = { officeToPdf: true, pdfToWord: true };

// `editFiles` covers editors built in three steps: TXT and CSV (D7), XLSX (D8), Word (D9). The
// feature is live once the first is; a format whose editor isn't built yet doesn't offer it.
export const BUILT_EDITS = { text: true, sheet: false, docx: false };

// The Pro tasks this file allows (each through D1's gate). A feature counts once its step has
// built it (`status: 'live'` in PRO_FEATURES); until then, none, and the Convert/Edit tool stays
// hidden. Conversions and edits never change the original, so a file from outside allows them too.
export function readerProTasks(
  subject: ReaderSubject,
  isLive: (id: ProTaskFeature) => boolean = isLiveFeature,
  built: typeof BUILT_CONVERSIONS = BUILT_CONVERSIONS,
  edits: typeof BUILT_EDITS = BUILT_EDITS
): ProTaskFeature[] {
  const format = formatOf(subject);
  const tasks: ProTaskFeature[] = [];
  if (format === 'PDF' || format === 'JPG') {
    // D6: scan/PDF → Word. A password-protected PDF can't be read.
    if (built.pdfToWord && (!subject.doc || canUsePageTools(subject.doc))) tasks.push('convert');
    // D10: fill forms and add text, on a PDF that isn't a scan (a scan has no form fields).
    if (format === 'PDF' && (!subject.doc || (isPdfLevel(subject.doc) && canUsePageTools(subject.doc)))) tasks.push('pdfForms');
  } else if (format === 'DOCX' || format === 'XLSX' || format === 'XLS' || format === 'CSV' || format === 'TXT') {
    // D5: Office → PDF.
    if (built.officeToPdf && canConvertToPdf(format)) tasks.push('convert');
    // D7–D9: edit TXT, CSV, XLSX and Word text (an old .xls is converted, not edited).
    const editable = format === 'TXT' || format === 'CSV' ? edits.text : format === 'XLSX' ? edits.sheet : format === 'DOCX' ? edits.docx : false;
    if (editable) tasks.push('editFiles');
  }
  return tasks.filter(isLive);
}

export function readerTools(subject: ReaderSubject, opts: { proTasks: readonly ProTaskFeature[]; isPro: boolean }): ReaderTool[] {
  const { doc } = subject;
  const tools: ReaderTool[] = [];
  // Mark (D3's Mark mode) and Select text: a scan's page masters, or an indexed imported PDF's
  // pages rendered on demand.
  if (doc && canMark(doc)) {
    tools.push({ id: 'mark', pro: false }, { id: 'selectText', pro: false });
  }
  // D4's notes panel: marks and bookmarks, which any library page document can have.
  if (doc && isPageRasterFormat(doc.format)) tools.push({ id: 'notes', pro: false });
  // R4's thumbnails strip.
  if (doc && isPageRasterFormat(doc.format) && doc.pages.length > 1) tools.push({ id: 'pages', pro: false });
  if (opts.proTasks.length > 0) tools.push({ id: 'convertEdit', pro: !opts.isPro });
  return tools;
}

// `proTasks`: readerProTasks for this subject; Convert to PDF is listed when `convert` is one of
// them on an office file, Convert to Word when it is on a scan or PDF, Edit when `editFiles` is.
export function readerMoreItems(subject: ReaderSubject, opts: { proTasks?: readonly ProTaskFeature[] } = {}): ReaderMoreItemId[] {
  const { doc } = subject;
  const raster = isPageRasterFormat(formatOf(subject));
  const items: ReaderMoreItemId[] = [];
  if (!doc) items.push('addToLibrary');
  if (doc && canSubmit(doc)) items.push('submit');
  items.push('share');
  // Export shares the PDF; other formats have none (Share sends the file itself).
  if (raster) items.push('export');
  if (canConvertToPdf(formatOf(subject)) && opts.proTasks?.includes('convert')) items.push('convertToPdf');
  if (raster && opts.proTasks?.includes('convert')) items.push('convertToWord');
  if (opts.proTasks?.includes('editFiles')) items.push('editFile');
  items.push('print');
  if (doc && canSign(doc)) items.push('sign');
  if (doc && canUsePageTools(doc)) items.push('editPages');
  if (doc && raster) items.push('bookmarks');
  if (doc && hasPageMasters(doc)) items.push('copyText', 'extractText');
  items.push('readingSettings');
  // Library documents only: a file from outside has no type and nothing to delete until it's added.
  if (doc) items.push('changeType', 'delete');
  return items;
}
