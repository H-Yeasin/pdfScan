import { t } from '../../i18n';
import { File } from 'expo-file-system';
import { typeNumberOf } from '../courses/docTypes';
import { getDocumentDir } from '../persistence/libraryFiles';
import { createId } from '../../utils/id';
import type { Annotation, Course, LibraryDocument, StudentProfile, Submission } from '../../types/models';
import { defaultSubmitPreset, type SubmitPreset } from './preset';
import { submissionPages, submitDocument, type SubmitResult } from './submitDocument';

// The row recorded after a Submit (§4 S7).
export function submissionRecord(
  doc: LibraryDocument,
  result: SubmitResult,
  preset: SubmitPreset,
  typeNumber: number,
  createdAt = Date.now()
): Submission {
  return {
    id: createId('sub'),
    documentId: doc.id,
    courseId: doc.courseId,
    fileName: result.fileName,
    sizeBytes: result.sizeBytes,
    sizeLimitBytes: preset.sizeLimitBytes,
    pageCount: submissionPages(doc).length,
    createdAt,
    preset,
    typeNumber,
  };
}

export function submissionFile(submission: Pick<Submission, 'documentId' | 'fileName'>): File {
  return new File(getDocumentDir(submission.documentId), 'submissions', submission.fileName);
}

const PDF_EXTENSION = /\.pdf$/i;

// The file to share again: the one handed in, or, if it's gone (another submit with the same
// name replaced it, or storage was cleared), rebuilt from the library masters with the settings
// it was made with. The profile and course are today's.
export async function ensureSubmissionFile(
  submission: Submission,
  doc: LibraryDocument,
  ctx: { profile: StudentProfile; course?: Course; docs: readonly LibraryDocument[]; annotations?: readonly Annotation[]; logoUri?: string }
): Promise<{ uri: string; rebuilt: boolean }> {
  const file = submissionFile(submission);
  if (file.exists) return { uri: file.uri, rebuilt: false };
  const result = await submitDocument({
    doc,
    preset: submission.preset ?? ctx.course?.submitPreset ?? defaultSubmitPreset(doc.courseId ?? null),
    profile: ctx.profile,
    course: ctx.course,
    n: submission.typeNumber ?? typeNumberOf(doc, ctx.docs),
    fileName: submission.fileName.replace(PDF_EXTENSION, ''),
    date: new Date(submission.createdAt),
    annotations: ctx.annotations?.filter((a) => a.documentId === doc.id),
    // The file was made before, with its cover: rebuilding it isn't a new use of a Pro cover
    // (§10 M4 lapse rule 'keepExisting').
    proCovers: true,
    logoUri: ctx.logoUri,
  });
  return { uri: result.uri, rebuilt: true };
}

// "Submitted 2× · last on 3 Oct" for the Reader.
export function submittedSummary(submissions: readonly Submission[], formatDate: (at: number) => string): string | null {
  if (submissions.length === 0) return null;
  const last = submissions.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return t('submit.summary', { count: submissions.length, date: formatDate(last.createdAt) });
}
