import type { Ionicons } from '@expo/vector-icons';
import type { CaptureModeSpec } from '../capture/captureModes';
import type { DocType, LibraryDocument } from '../../types/models';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type DocTypeSpec = {
  id: DocType;
  label: string;
  // Plural, for filter chips ("Assignments 3").
  plural: string;
  icon: IoniconName;
  // What §4's naming template writes for `{type}`, so `{type}{n}` reads like a student would
  // label it: HW3, Lab2, Exam1.
  short: string;
};

// Display order everywhere (Deliver chips, filters, pickers).
export const DOC_TYPES: readonly DocTypeSpec[] = [
  { id: 'assignment', label: 'Assignment', plural: 'Assignments', icon: 'clipboard-outline', short: 'HW' },
  { id: 'notes', label: 'Notes', plural: 'Notes', icon: 'create-outline', short: 'Notes' },
  { id: 'handout', label: 'Handout', plural: 'Handouts', icon: 'document-text-outline', short: 'Handout' },
  { id: 'exam', label: 'Exam', plural: 'Exams', icon: 'school-outline', short: 'Exam' },
  { id: 'lab', label: 'Lab', plural: 'Labs', icon: 'flask-outline', short: 'Lab' },
  { id: 'other', label: 'Other', plural: 'Other', icon: 'ellipsis-horizontal-circle-outline', short: 'Doc' },
];

const BY_ID = new Map(DOC_TYPES.map((spec) => [spec.id, spec]));

export function getDocType(id: DocType): DocTypeSpec {
  return BY_ID.get(id) ?? BY_ID.get('other')!;
}

export function isDocType(value: unknown): value is DocType {
  return typeof value === 'string' && BY_ID.has(value as DocType);
}

// A document without a type (saved before K4, imported, merged) counts as Other.
export function docTypeOf(doc: Pick<LibraryDocument, 'docType'>): DocType {
  return doc.docType ?? 'other';
}

// The type a new scan starts with, from its capture mode's kind of material. Deliver preselects it.
const DEFAULT_BY_MODE_KIND: Record<CaptureModeSpec['docType'], DocType> = {
  notes: 'notes',
  document: 'handout',
  board: 'notes',
  book: 'handout',
  id: 'other',
};

export function defaultDocTypeFor(spec: Pick<CaptureModeSpec, 'docType'>): DocType {
  return DEFAULT_BY_MODE_KIND[spec.docType];
}

// Counts per type, for filter chips. Only types that occur, in DOC_TYPES order.
export function docTypeCounts(docs: readonly Pick<LibraryDocument, 'docType'>[]): { type: DocType; count: number }[] {
  const counts = new Map<DocType, number>();
  for (const doc of docs) counts.set(docTypeOf(doc), (counts.get(docTypeOf(doc)) ?? 0) + 1);
  return DOC_TYPES.filter((spec) => counts.has(spec.id)).map((spec) => ({ type: spec.id, count: counts.get(spec.id)! }));
}

// `{n}` for §4's naming template: the number the next document of this type in this course gets
// (HW1, HW2, ...). Counts the documents that exist now, so deleted ones free their number.
// `courseId` undefined = Unsorted. The same rule runs in SQL as libraryRepo.nextTypeNumber.
export function nextTypeNumber(
  docs: readonly Pick<LibraryDocument, 'courseId' | 'docType'>[],
  courseId: string | undefined,
  type: DocType
): number {
  return docs.filter((d) => d.courseId === courseId && docTypeOf(d) === type).length + 1;
}

// The number a saved document has within its course and type: 1 + the documents of that course
// and type made before it (ties broken by id). For a document submitted after it was saved, so
// its cover says "Assignment 3" whatever was added since.
export function typeNumberOf(
  doc: Pick<LibraryDocument, 'id' | 'courseId' | 'docType' | 'createdAt'>,
  docs: readonly Pick<LibraryDocument, 'id' | 'courseId' | 'docType' | 'createdAt'>[]
): number {
  const type = docTypeOf(doc);
  const earlier = docs.filter(
    (d) =>
      d.id !== doc.id &&
      d.courseId === doc.courseId &&
      docTypeOf(d) === type &&
      (d.createdAt < doc.createdAt || (d.createdAt === doc.createdAt && d.id < doc.id))
  );
  return earlier.length + 1;
}
