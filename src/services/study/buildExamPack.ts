import { File } from 'expo-file-system';
import { processSequentially } from '../capture/processSequentially';
import { writeAnnotations } from '../annotations/pdfAnnotations';
import { renderLayoutImage } from '../pdf/academicRasterService';
import { formatCoverDate, itemsAsOcr, layoutContents, type ContentsEntry } from '../pdf/coverTemplates';
import { buildPdfFromPages, pageDimensions, type PageSizeId } from '../pdf/pdfService';
import { copyPageInto } from '../persistence/libraryOperations';
import { footerPresetText } from '../submit/footerPresets';
import { tDoc } from '../../i18n';
import { getDocumentDir } from '../persistence/libraryFiles';
import { buildSearchHaystack } from '../search/searchService';
import type { Annotation, LibraryDocument, LibraryPage } from '../../types/models';
import { createId } from '../../utils/id';
import type { PackItem } from '../../store/slices/packSlice';

export type ExamPackOptions = {
  title: string;
  // Under the title on the contents page, e.g. "CSE 101 · 2 October 2026".
  subtitle?: string;
  courseId: string | null;
  contents: boolean;
  includeAnnotations: boolean;
  pageNumbers: boolean;
  pageSize: PageSizeId;
  onProgress?: (text: string) => void;
};

// The contents page image; Skia in the app, replaced in tests.
export type RenderPage = typeof renderLayoutImage;

type Picked = { doc: LibraryDocument; page: LibraryPage; idx: number };

// Consecutive pages from the same document make one contents entry.
function contentsEntries(picked: readonly Picked[], firstPackPage: number): ContentsEntry[] {
  const entries: ContentsEntry[] = [];
  picked.forEach((p, i) => {
    const packPage = firstPackPage + i;
    const last = entries[entries.length - 1];
    if (last && last.document === p.doc.name && picked[i - 1]?.doc.id === p.doc.id) {
      last.sourcePages.push(p.idx + 1);
      last.packPages[1] = packPage;
    } else {
      entries.push({ document: p.doc.name, sourcePages: [p.idx + 1], packPages: [packPage, packPage] });
    }
  });
  return entries;
}

// §5 T6: a new library document made of copies of the picked pages (masters, thumbnails, OCR,
// and their annotations as new rows), optionally after a contents page, built into a PDF like any
// document. Copies, not references, so the pack stays whole when a source document is deleted.
// Pages are copied one at a time. Returns the document and its annotations, to be added to the
// store; nothing is dispatched here.
export async function buildExamPack(
  items: readonly PackItem[],
  docs: readonly LibraryDocument[],
  annotations: readonly Annotation[],
  options: ExamPackOptions,
  renderPage: RenderPage = renderLayoutImage
): Promise<{ doc: LibraryDocument; annotations: Annotation[] }> {
  const picked: Picked[] = [];
  for (const item of items) {
    const doc = docs.find((d) => d.id === item.documentId);
    const idx = doc ? doc.pages.findIndex((p) => p.id === item.pageId) : -1;
    if (doc && idx >= 0) picked.push({ doc, page: doc.pages[idx], idx });
  }
  if (picked.length === 0) throw new Error('buildExamPack: none of the picked pages exist any more');

  const documentId = createId('doc');
  const dir = getDocumentDir(documentId);
  if (!dir.exists) dir.create({ intermediates: true });
  const pages: LibraryPage[] = [];

  if (options.contents) {
    options.onProgress?.('Making the contents page…');
    const dims = pageDimensions(options.pageSize);
    const items = layoutContents(options.title, options.subtitle ?? '', contentsEntries(picked, 2), dims);
    const rendered = await renderPage(items, options.pageSize, 'contents');
    const dest = new File(dir, 'page_1.jpg');
    if (dest.exists) dest.delete();
    new File(rendered.uri).moveSync(dest);
    pages.push({
      id: createId('page'),
      fileUri: dest.uri,
      width: rendered.width,
      height: rendered.height,
      ocr: itemsAsOcr(items, rendered.width / dims.width),
    });
  }

  const newPageIdFor = new Map<string, string>();
  const offset = pages.length;
  const copied = await processSequentially(picked, async (p, i) => {
    options.onProgress?.(`Copying page ${i + 1} of ${picked.length}…`);
    const page = copyPageInto(p.page, dir, offset + i + 1);
    newPageIdFor.set(`${p.doc.id}:${p.page.id}`, page.id);
    return page;
  });
  if (copied.error) throw copied.error;
  pages.push(...copied.items);

  const now = Date.now();
  const packAnnotations: Annotation[] = options.includeAnnotations
    ? annotations.flatMap((a) => {
        const pageId = newPageIdFor.get(`${a.documentId}:${a.pageId}`);
        return pageId ? [{ ...a, id: createId('annot'), documentId, pageId, createdAt: now, updatedAt: now }] : [];
      })
    : [];

  const mapped = { pages, coverKind: undefined, pdfLayout: 'standard' as const, pdfPageSize: options.pageSize };
  const pdf = await buildPdfFromPages(
    documentId,
    pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout })),
    'as-is',
    options.pageNumbers ? { enableBorder: false, footerText: footerPresetText('pages') } : undefined,
    'standard',
    options.pageSize,
    {
      onPage: (done, total) => options.onProgress?.(`Building PDF… page ${done} of ${total}`),
      beforeSave: packAnnotations.length ? (pdfDoc) => writeAnnotations(pdfDoc, mapped, packAnnotations) : undefined,
    }
  );

  const doc: LibraryDocument = {
    id: documentId,
    name: options.title,
    format: 'PDF',
    mode: 'doc',
    pages,
    pdfUri: pdf.uri,
    sizeBytes: pdf.sizeBytes,
    createdAt: now,
    star: false,
    tag: 'PACK',
    locked: false,
    searchHaystack: buildSearchHaystack(options.title, pages),
    courseId: options.courseId ?? undefined,
    docType: 'notes',
    pdfLayout: 'standard',
    pdfPageSize: options.pageSize,
  };
  return { doc, annotations: packAnnotations };
}

// "CSE101 exam pack – 2 October 2026".
export function defaultPackTitle(courseLabel: string | undefined, date: Date): string {
  const when = formatCoverDate(date);
  return courseLabel ? tDoc('document.examPack', { course: courseLabel, date: when }) : tDoc('document.examPackNoCourse', { date: when });
}
