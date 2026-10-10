import { t } from '../../i18n';
import { Directory, File } from 'expo-file-system';
import { docTypeOf } from '../courses/docTypes';
import { allowedCover, coverDefaults, withCoverDefaults, type CoverValues } from '../pdf/coverTemplates';
import { buildPdfFromPages, decoratePdf, encodingForQuality, type AcademicConfig, type PdfSourcePage, toSourcePage } from '../pdf/pdfService';
import { loadPdf, savePdf } from '../pdf/pdfOps';
import { buildRasterPdf, renderedPageBytes } from '../pdf/rasterPdf';
import { isPdfLevel } from '../documents/formatCapabilities';
import { SIZE_LADDER } from '../capture/imageSpec';
import { annotatedPdfFor } from '../annotations/exportPdf';
import { writeMarks } from '../annotations/pdfAnnotations';
import { isSignature } from '../signature/signatureRows';
import { getDocumentDir } from '../persistence/libraryFiles';
import { sanitizeFileName } from '../../utils/sanitize';
import type { Annotation, Course, LibraryDocument, LibraryPage, StudentProfile } from '../../types/models';
import { firstLine, renderText, type NamingContext } from './naming';
import { presetAcademicConfig, presetFooterText, type SubmitPreset } from './preset';
import { buildPdfUnderLimit, buildUnderLimit, findLevel, formatLimit, pdfOverheadBytes, type SizedBuild } from './sizeTarget';

export type SubmitInput = {
  doc: LibraryDocument;
  preset: SubmitPreset;
  profile: StudentProfile;
  course?: Course;
  // The document's own number in its course and type (docTypes.typeNumberOf), for the cover and
  // the `{n}` token.
  n: number;
  // The cover's typed values, if the student edited any in Deliver.
  coverValues?: CoverValues;
  // A header, if one was set in Deliver; presets don't keep one.
  headerText?: string;
  // A photographed cover sheet picked in Deliver, used instead of the preset's template cover.
  coverPhotoUri?: string;
  // Image quality (1-5) when the preset has no size limit. Default 3, the slider's default.
  quality?: number;
  // Without extension. Default: the document's name.
  fileName?: string;
  date?: Date;
  onProgress?: (text: string) => void;
  // The document's annotations. Marks are written only when the preset says includeAnnotations;
  // a signature (§18 W16) is part of what is handed in, and always is.
  annotations?: readonly Annotation[];
  // §10 M4: whether the preset's Pro cover template may be drawn (Pro is active, or the file
  // being rebuilt was made with it). Otherwise its free fallback is. Default false.
  proCovers?: boolean;
  // §10 M4: the institution logo's URI for the University cover (institutionLogoUri).
  logoUri?: string;
};

export type SubmitResult = {
  uri: string;
  // With `.pdf`: the name the receiving app sees.
  fileName: string;
  sizeBytes: number;
  // False only when a size limit was set and even the smallest build is over it.
  fits: boolean;
  // The SIZE_LADDER level used with a size limit (for sizeTarget.tooLargeMessage); 0 without one.
  level: number;
  // §7 R2: an imported PDF's pages had to be turned into images to fit the limit (the text stays
  // searchable). The caller tells the student.
  rasterized?: boolean;
};

const FALLBACK_FILE_NAME = 'submission';

// The pages a submission is built from: the library masters (clean, never stamped), without the
// cover a saved document may already start with - the preset adds its own.
export function submissionPages(doc: LibraryDocument): PdfSourcePage[] {
  const pages = doc.coverKind ? doc.pages.slice(1) : doc.pages;
  return pages.map(toSourcePage);
}

// The academic options a submission is drawn with: the preset's, with the cover filled from the
// profile and course and the header/footer tokens filled in.
export function submissionAcademicConfig(
  input: Pick<SubmitInput, 'preset' | 'coverValues' | 'headerText' | 'coverPhotoUri' | 'proCovers' | 'logoUri'>,
  ctx: NamingContext
): AcademicConfig | null {
  const preset = presetAcademicConfig(input.preset);
  const base = preset && { ...preset, coverPage: allowedCover(preset.coverPage, input.proCovers === true) };
  const headerText = input.headerText ? renderText(input.headerText, ctx) || undefined : undefined;
  if (!base && !headerText && !input.coverPhotoUri) return null;
  const footer = presetFooterText(input.preset);
  return {
    enableBorder: base?.enableBorder ?? false,
    headerText,
    footerText: footer ? renderText(footer, ctx) || undefined : undefined,
    coverPage: input.coverPhotoUri
      ? { mode: 'imported_image', importedUri: input.coverPhotoUri }
      : base?.coverPage?.mode === 'template'
        ? withCoverDefaults({ ...base.coverPage, values: input.coverValues ?? {} }, coverDefaults({ ...ctx, logoUri: input.logoUri }))
        : undefined,
  };
}

// Builds the file a teacher receives (§4 S6), separate from the library's document.pdf: named
// for the teacher, laid out and sized by the course's preset, at
// library/<docId>/submissions/<file name>.pdf (replacing an earlier one with the same name).
// Pages are drawn one at a time, as every build is.
export async function submitDocument(input: SubmitInput): Promise<SubmitResult> {
  const { doc, preset, onProgress } = input;
  const pages = submissionPages(doc);
  if (pages.length === 0) throw new Error(`submitDocument: ${doc.id} has no page images to submit`);

  const ctx: NamingContext = {
    profile: input.profile,
    course: input.course,
    docType: docTypeOf(doc),
    n: input.n,
    date: input.date ?? new Date(),
    title: firstLine(pages[0]?.ocr?.text),
  };
  const academicConfig = submissionAcademicConfig(input, ctx) ?? undefined;

  const fileName = `${sanitizeFileName(input.fileName ?? doc.name) || FALLBACK_FILE_NAME}.pdf`;
  const dir = new Directory(getDocumentDir(doc.id), 'submissions');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, fileName);
  const onPage = (done: number, total: number) => onProgress?.(t('deliver.progress.buildingPage', { current: done, total }));
  // §5 T4: the submission's own layout for mapping annotations - its content pages, after the
  // preset's cover if it has one (a stand-in page, so the offset is right). An annotation on the
  // document's old cover page has no place here and is left out.
  if (isPdfLevel(doc)) return submitPdfLevel(input, academicConfig, dest, fileName, onPage);

  const contentPages: LibraryPage[] = doc.coverKind ? doc.pages.slice(1) : doc.pages;
  const hasCover = !!academicConfig?.coverPage;
  const coverStandIn: LibraryPage = { id: '__submission_cover__', fileUri: '', width: 1, height: 1 };
  const rows = submittedRows(input);
  const beforeSave = rows.length
    ? (pdf: Parameters<typeof writeMarks>[0]) =>
        writeMarks(
          pdf,
          {
            pages: hasCover ? [coverStandIn, ...contentPages] : contentPages,
            coverKind: hasCover ? 'imported_image' : undefined,
            pdfLayout: preset.layout === '2_in_1' ? '2_in_1' : 'standard',
            pdfPageSize: preset.pageSize,
          },
          rows
        )
    : undefined;

  if (preset.sizeLimitBytes !== null) {
    onProgress?.(t('deliver.progress.fitting', { size: formatLimit(preset.sizeLimitBytes) }));
    const sized = await buildPdfUnderLimit(doc.id, pages, preset.sizeLimitBytes, academicConfig, preset.layout, preset.pageSize, {
      dest,
      onPage,
      beforeSave,
    });
    return { uri: sized.uri, fileName, sizeBytes: sized.sizeBytes, fits: sized.fits, level: sized.level };
  }
  const built = await buildPdfFromPages(doc.id, pages, encodingForQuality(input.quality ?? 3), academicConfig, preset.layout, preset.pageSize, {
    dest,
    onPage,
    beforeSave,
  });
  return { uri: built.uri, fileName, sizeBytes: built.sizeBytes, fits: true, level: 0 };
}

// The rows a submission carries: every mark with `includeAnnotations`, the signatures always.
function submittedRows(input: Pick<SubmitInput, 'preset' | 'annotations'>): readonly Annotation[] {
  const all = input.annotations ?? [];
  return input.preset.includeAnnotations ? all : all.filter(isSignature);
}

// §7 R2: a submission of an imported PDF (or a merge containing one). The original file is sent
// as it is - vector text, links and all - with the preset's cover put in front and its
// border/header/footer stamped on every page. Only when that is over the size limit are the pages
// turned into images, through the same ladder as scans (S3): sampled renders pick the starting
// level, then build and step down. The 2-in-1 layout doesn't apply here: the pages stay as the
// PDF has them. §18 W14: the file sent is the copy with the rows written in (exportPdf), made
// before the cover goes in front, while the pages still line up with the library's; the images
// of the size ladder are rendered from that copy too.
async function submitPdfLevel(
  input: SubmitInput,
  academicConfig: AcademicConfig | undefined,
  dest: File,
  fileName: string,
  onPage: (done: number, total: number) => void
): Promise<SubmitResult> {
  const { doc, preset, onProgress } = input;
  const uri = await annotatedPdfFor(doc, submittedRows(input));
  if (!uri) throw new Error(`submitDocument: ${doc.id} has no PDF`);

  const original = await loadPdf(uri);
  if (academicConfig) await decoratePdf(original, academicConfig, preset.pageSize);
  const asIs = await savePdf(original, dest);
  const limit = preset.sizeLimitBytes;
  if (limit === null || asIs.sizeBytes <= limit) return { uri: asIs.uri, fileName, sizeBytes: asIs.sizeBytes, fits: true, level: 0 };

  onProgress?.(t('deliver.progress.fitting', { size: formatLimit(limit) }));
  const pageCount = doc.pages.length;
  const sampled = [...new Set([0, Math.floor((pageCount - 1) / 2), pageCount - 1])].filter((i) => i >= 0);
  const measure = async (level: number) => {
    const sizes: number[] = [];
    for (const i of sampled) sizes.push(await renderedPageBytes(uri, i, SIZE_LADDER[level]));
    return sizes;
  };
  const start = await findLevel(measure, pageCount, pdfOverheadBytes(pageCount), limit);
  const sized: SizedBuild = await buildUnderLimit(
    (level) => buildRasterPdf(uri, doc.pages, SIZE_LADDER[level], { dest, academicConfig, pageSize: preset.pageSize, onPage }),
    start,
    limit
  );
  return { uri: sized.uri, fileName, sizeBytes: sized.sizeBytes, fits: sized.fits, level: sized.level, rasterized: true };
}
