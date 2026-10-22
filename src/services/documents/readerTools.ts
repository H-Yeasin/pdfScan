import type { DocFormat, LibraryDocument } from '../../types/models';
import { getProFeature } from '../pro/proFeatures';
import type { ProTaskFeature } from '../pro/proTask';
import {
  canAddCover,
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
// tap away; sharing and managing the file (submit, print, rename, move, edit pages, sign, delete) is
// in More. Pure, so the rules per format and Pro state are tested without rendering the Reader.

export type ReaderToolId = 'mark' | 'selectText' | 'notes' | 'pages' | 'convertEdit';
// `pro`: show the Pro badge (the tool runs a Pro task, and the student has no Pro pass).
export type ReaderTool = { id: ReaderToolId; pro: boolean };

// §18 W23: More's items, by section. Study tools and Convert/Edit/Fill form are in the bottom
// tool bar, bookmarks in the top bar and Notes, copying a page's text in the selection: none of
// them is repeated here.
export type ReaderMoreItemId =
  // Share & export. §4 S6: rebuild and share the teacher's copy with the course's preset.
  | 'submit'
  // The file itself (a PDF with its marks written in, §18 W14).
  | 'share'
  // A JPG-format document: the PDF made of its pages, or the page images themselves.
  | 'shareAsPdf'
  | 'shareImages'
  | 'print'
  // Organise. A file from outside: only Add to library.
  | 'addToLibrary'
  | 'rename'
  | 'move'
  // "Star" or "Unstar", by the document's state.
  | 'star'
  | 'changeType'
  // §7 R3: reorder, rotate, delete, extract and add pages.
  | 'editPages'
  // §14 Q7: a cover page on a library PDF; "Change cover page" when it has one.
  | 'addCover'
  | 'changeCover'
  | 'split'
  | 'compress'
  // Study: every page's text as a .txt (§5 T3).
  | 'saveText'
  // Document.
  | 'sign'
  | 'readingSettings'
  | 'delete';

export type ReaderMoreSectionId = 'share' | 'organise' | 'study' | 'document';
export type ReaderMoreSection = { id: ReaderMoreSectionId; items: ReaderMoreItemId[] };

// What the Reader has open: a library document, or a file from outside (not in the library yet).
export type ReaderSubject = { doc: LibraryDocument; external?: undefined } | { doc?: undefined; external: { format: DocFormat } };

function formatOf(subject: ReaderSubject): DocFormat {
  return subject.doc ? subject.doc.format : subject.external.format;
}

const isLiveFeature = (id: ProTaskFeature) => getProFeature(id).status === 'live';

// `convert` covers two conversions built in different steps: Office → PDF (D5) and scan/PDF → Word
// (D6). Both are built; kept so the rules per format stay testable on their own.
export const BUILT_CONVERSIONS = { officeToPdf: true, pdfToWord: true };

// `editFiles` covers editors built in three steps: TXT and CSV (D7), XLSX (D8), Word (D9). All
// are built; kept so the rules per format stay testable on their own.
export const BUILT_EDITS = { text: true, sheet: true, docx: true };

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
    // D10: fill in a form, on a PDF that isn't a scan (a scan has no form fields). D10's other
    // half, Mark mode's Text tool, goes through the same feature's gate from Mark mode instead.
    if (format === 'PDF' && (!subject.doc || (isPdfLevel(subject.doc) && canUsePageTools(subject.doc)))) tasks.push('pdfForms');
  } else if (format === 'DOCX' || format === 'XLSX' || format === 'XLS' || format === 'CSV' || format === 'TXT') {
    // D5: Office → PDF.
    if (built.officeToPdf && canConvertToPdf(format)) tasks.push('convert');
    // D7–D9: edit TXT, CSV, XLSX/XLS cells and Word text (D8 saves an .xls's edit as .xlsx).
    const editable =
      format === 'TXT' || format === 'CSV' ? edits.text : format === 'XLSX' || format === 'XLS' ? edits.sheet : format === 'DOCX' ? edits.docx : false;
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

// §18 W23: More, in sections, in a fixed order, Delete last. A section with nothing in it for this
// file is left out.
export function readerMoreSections(subject: ReaderSubject): ReaderMoreSection[] {
  const { doc } = subject;
  const format = formatOf(subject);

  const share: ReaderMoreItemId[] = [];
  if (doc && canSubmit(doc)) share.push('submit');
  // A scan saved as JPG has no single file: it goes out as a PDF or as its images. A PDF's
  // Share is its PDF already (the old Export was the same file twice).
  if (doc && format === 'JPG') share.push('shareAsPdf', 'shareImages');
  else share.push('share');
  share.push('print');

  const organise: ReaderMoreItemId[] = [];
  if (!doc) organise.push('addToLibrary');
  else {
    organise.push('rename', 'move', 'star', 'changeType');
    if (canUsePageTools(doc)) organise.push('editPages');
    if (canAddCover(doc)) organise.push(doc.coverKind ? 'changeCover' : 'addCover');
    // One page has nothing to split.
    if (canUsePageTools(doc) && doc.pages.length > 1) organise.push('split');
    if (canUsePageTools(doc)) organise.push('compress');
  }

  const study: ReaderMoreItemId[] = [];
  if (doc && hasPageMasters(doc)) study.push('saveText');

  const document: ReaderMoreItemId[] = [];
  if (doc && canSign(doc)) document.push('sign');
  document.push('readingSettings');
  // A file from outside has nothing to delete until it's added.
  if (doc) document.push('delete');

  const sections: ReaderMoreSection[] = [
    { id: 'share', items: share },
    { id: 'organise', items: organise },
    { id: 'study', items: study },
    { id: 'document', items: document },
  ];
  return sections.filter((s) => s.items.length > 0);
}

export function readerMoreItemIds(sections: readonly ReaderMoreSection[]): ReaderMoreItemId[] {
  return sections.flatMap((s) => s.items);
}
