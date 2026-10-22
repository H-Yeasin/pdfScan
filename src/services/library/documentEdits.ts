import type { LibraryDocument } from '../../types/models';

// §8: what isn't an edit of the document - the page the Reader is on (§7 R4, §18 W19), the
// integrity check's missing-files flag (§8 B1), the backfill's "couldn't read the PDF" (§16 G4)
// and the change time itself (§17 U7). A change to only these keeps documents.updated_at, which
// backups compare (B2's importPlan: "already here" vs "changed since") and which says when the
// library last changed (B5's reminder and automatic backups) - so reading a document doesn't count
// as changing it. Shared by the repository (libraryRepo.documentEdited) and the reducer, which
// stamps `updatedAt` on the same changes so Files' "Date modified" agrees with what is stored.
export const NOT_EDITS: readonly (keyof LibraryDocument)[] = ['lastPage', 'lastPosition', 'missingFiles', 'pdfInfoFailed', 'updatedAt'];

// Whether a patch to a document is an edit (any field outside NOT_EDITS).
export function patchEdits(patch: Partial<LibraryDocument>): boolean {
  return (Object.keys(patch) as (keyof LibraryDocument)[]).some((key) => !NOT_EDITS.includes(key));
}
