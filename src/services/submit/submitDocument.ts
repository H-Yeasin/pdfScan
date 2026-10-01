import { Directory, File } from 'expo-file-system';
import { docTypeOf } from '../courses/docTypes';
import { coverDefaults, withCoverDefaults, type CoverValues } from '../pdf/coverTemplates';
import { buildPdfFromPages, encodingForQuality, type AcademicConfig, type PdfSourcePage } from '../pdf/pdfService';
import { writeAnnotations } from '../annotations/pdfAnnotations';
import { getDocumentDir } from '../persistence/libraryFiles';
import { sanitizeFileName } from '../../utils/sanitize';
import type { Annotation, Course, LibraryDocument, LibraryPage, StudentProfile } from '../../types/models';
import { firstLine, renderText, type NamingContext } from './naming';
import { presetAcademicConfig, presetFooterText, type SubmitPreset } from './preset';
import { buildPdfUnderLimit, formatLimit } from './sizeTarget';

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
  // The document's annotations; written only when the preset says includeAnnotations.
  annotations?: readonly Annotation[];
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
};

const FALLBACK_FILE_NAME = 'submission';

// The pages a submission is built from: the library masters (clean, never stamped), without the
// cover a saved document may already start with - the preset adds its own.
export function submissionPages(doc: LibraryDocument): PdfSourcePage[] {
  const pages = doc.coverKind ? doc.pages.slice(1) : doc.pages;
  return pages.map((p) => ({ uri: p.fileUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout }));
}

// The academic options a submission is drawn with: the preset's, with the cover filled from the
// profile and course and the header/footer tokens filled in.
export function submissionAcademicConfig(
  input: Pick<SubmitInput, 'preset' | 'coverValues' | 'headerText' | 'coverPhotoUri'>,
  ctx: NamingContext
): AcademicConfig | null {
  const base = presetAcademicConfig(input.preset);
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
        ? withCoverDefaults({ ...base.coverPage, values: input.coverValues ?? {} }, coverDefaults(ctx))
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
  const onPage = (done: number, total: number) => onProgress?.(`Building PDF… page ${done} of ${total}`);
  // §5 T4: the submission's own layout for mapping annotations - its content pages, after the
  // preset's cover if it has one (a stand-in page, so the offset is right). An annotation on the
  // document's old cover page has no place here and is left out.
  const contentPages: LibraryPage[] = doc.coverKind ? doc.pages.slice(1) : doc.pages;
  const hasCover = !!academicConfig?.coverPage;
  const coverStandIn: LibraryPage = { id: '__submission_cover__', fileUri: '', width: 1, height: 1 };
  const beforeSave =
    preset.includeAnnotations && input.annotations?.length
      ? (pdf: Parameters<typeof writeAnnotations>[0]) =>
          writeAnnotations(
            pdf,
            {
              pages: hasCover ? [coverStandIn, ...contentPages] : contentPages,
              coverKind: hasCover ? 'imported_image' : undefined,
              pdfLayout: preset.layout === '2_in_1' ? '2_in_1' : 'standard',
              pdfPageSize: preset.pageSize,
            },
            input.annotations!
          )
      : undefined;

  if (preset.sizeLimitBytes !== null) {
    onProgress?.(`Fitting under ${formatLimit(preset.sizeLimitBytes)}…`);
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
