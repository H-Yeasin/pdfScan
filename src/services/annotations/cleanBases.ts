import { useSyncExternalStore } from 'react';
import { processSequentially } from '../capture/processSequentially';
import type { Annotation, LibraryDocument } from '../../types/models';

// §18 W17 (A9): `document.pdf` never holds our marks or signatures. Builds before W17 wrote them
// into it (after each Mark session, and in every rebuild), so the files made by those builds are
// cleaned once: every document that had rows when this build first ran gets ours taken out of
// its PDF (exportPdf.settleOurAnnotations), one document at a time.
//
// Only documents with rows: an older build took ours out of a file when its last row went, so a
// document without rows has none of ours in its file. And only once: nothing writes them any
// more, and a backup made by an older build is settled as it is restored (restoreBackup).
//
// The list of documents still to do is kept (the `meta` table), so a run that was cut short
// carries on at the next start, also for a document whose rows were deleted in between. Until an
// imported PDF is clean the Reader draws its pages without the file's annotations
// (`useBasePending`), or ours would show twice: once from the file, once from the rows.

export const META_CLEAN_PDF_BASES = 'cleanPdfBases';

// A file that still can't be cleaned after this many starts is left as it is: pdf-lib can't open
// it (a password, damage), so no build could write ours into it either.
export const CLEAN_MAX_TRIES = 3;

// The documents still to clean → how many times cleaning one has failed.
export type CleanState = { pending: Record<string, number> };

// null: this build has never planned the cleaning (or what it stored can't be read).
export function parseCleanState(raw: string | null): CleanState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const pending = parsed && typeof parsed === 'object' ? (parsed as { pending?: unknown }).pending : undefined;
    if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return null;
    const out: Record<string, number> = {};
    for (const [id, tries] of Object.entries(pending)) {
      if (typeof tries === 'number' && Number.isFinite(tries)) out[id] = tries;
    }
    return { pending: out };
  } catch {
    return null;
  }
}

// The first plan: every document that has a PDF and at least one row.
export function planClean(files: readonly Pick<LibraryDocument, 'id' | 'pdfUri'>[], annotations: readonly Pick<Annotation, 'documentId'>[]): CleanState {
  const marked = new Set(annotations.map((a) => a.documentId));
  const pending: Record<string, number> = {};
  for (const doc of files) {
    if (doc.pdfUri && marked.has(doc.id)) pending[doc.id] = 0;
  }
  return { pending };
}

// What the Reader asks: the documents whose file may still hold ours.
let pendingIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function setPendingBases(state: CleanState): void {
  pendingIds = new Set(Object.keys(state.pending));
  listeners.forEach((l) => l());
}

export function isBasePending(docId: string): boolean {
  return pendingIds.has(docId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBasePending(docId: string | undefined): boolean {
  const read = () => (docId ? isBasePending(docId) : false);
  return useSyncExternalStore(subscribe, read, read);
}

export type CleanIo = {
  // The document's PDF as it is now; undefined when the document (or its PDF) is gone.
  pdfUriOf: (docId: string) => string | undefined;
  // Takes ours out of the file, in place and atomically; how many there were. Throws for a file
  // that can't be opened or written.
  clean: (uri: string) => Promise<number>;
  // Stores the list after each document.
  save: (state: CleanState) => Promise<void>;
  onCleaned?: (docId: string, removed: number) => void;
  // Checked between documents.
  signal?: AbortSignal;
};

// Cleans the pending documents one at a time (pdf-lib holds a whole file in memory). A document
// that is done, or gone, leaves the list; one that failed stays for the next start, up to
// CLEAN_MAX_TRIES. Returns the list as it is afterwards.
export async function runClean(state: CleanState, io: CleanIo): Promise<CleanState> {
  let current = state;
  await processSequentially(
    Object.keys(state.pending),
    async (docId) => {
      const pending = { ...current.pending };
      const uri = io.pdfUriOf(docId);
      let removed: number | null = null;
      if (uri) {
        try {
          removed = await io.clean(uri);
        } catch (error) {
          console.warn('cleanBases: could not clean', docId, error);
          pending[docId] = (pending[docId] ?? 0) + 1;
        }
      }
      if (!uri || removed !== null || pending[docId] >= CLEAN_MAX_TRIES) delete pending[docId];
      current = { pending };
      setPendingBases(current);
      await io.save(current);
      if (removed !== null) io.onCleaned?.(docId, removed);
    },
    { signal: io.signal }
  );
  return current;
}
