import { useMemo, type Dispatch } from 'react';
import { t } from '../../i18n';
import { isPdfLevel } from '../../services/documents/formatCapabilities';
import { renamedTo } from '../../services/library/rename';
import { PdfEncryptedError } from '../../services/pdf/pdfErrors';
import { deleteDocumentFiles } from '../../services/persistence/libraryFiles';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import type { AppAction } from '../../store/appReducer';
import type { Annotation, Course, LibraryDocument } from '../../types/models';
import type { TaskControl } from '../../services/feedback/task';
import { runWithToast } from '../ui';

// §16 G3: libraryOperations (and pdf-lib with it) loads with the first split or compress, not with
// Home, the Library or the Reader, which use these from their first frame.
export function libraryOps(): typeof import('../../services/persistence/libraryOperations') {
  return require('../../services/persistence/libraryOperations') as typeof import('../../services/persistence/libraryOperations');
}

// Compresses each document, one at a time, and returns the message to show. Shared by the
// selection bar, the Reader's More and Settings → Storage's biggest documents (§8 B1). An imported
// PDF can only get smaller by becoming images; the message says when that happened, and when it
// wouldn't have helped.
// `quality`: Deliver's 1-5 export ladder (2 by default; §17 U8's Tools offers 1-3).
// `task` (§17 U13): the toast's progress, file by file, and Cancel between files (the ones done
// stay compressed).
export async function compressDocuments(
  docs: readonly LibraryDocument[],
  dispatch: Dispatch<AppAction>,
  quality = 2,
  task?: Pick<TaskControl, 'progress'> & Partial<Pick<TaskControl, 'throwIfCancelled'>>
): Promise<string> {
  let rasterized = 0;
  let notSmaller = 0;
  for (const [i, doc] of docs.entries()) {
    task?.throwIfCancelled?.();
    if (isPdfLevel(doc)) {
      const result = await libraryOps().compressImportedPdf(doc, quality);
      if (result.smaller) {
        rasterized += 1;
        dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: result.doc });
      } else {
        notSmaller += 1;
      }
    } else {
      const compressed = await libraryOps().compressDocument(doc, quality);
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: compressed });
    }
    task?.progress(i + 1, docs.length);
  }
  return rasterized ? t('library.compressedAsImages') : notSmaller ? t('library.alreadySmall') : t('library.compressed');
}

// What a failed merge, split or compress says.
export function toolFailure(error: unknown): string {
  return error instanceof PdfEncryptedError ? t('library.passwordProtected') : t('library.toolFailed');
}

// §18 W23 / §17 U7: what can be done to one document (or, for Move, several) wherever it is shown:
// the Reader's More, and from U7 the Files row menu and selection bar. Each action dispatches and
// says what happened in a snack; the dialogs and pickers that ask first are the caller's (the
// Reader's go through its sheet state machine). Not a hook so it is tested without rendering.
export function documentActions(dispatch: Dispatch<AppAction>, courses: readonly Course[]) {
  const snack = (msg: string) => dispatch({ type: 'ui/SHOW_SNACK', msg });

  return {
    // The name only: the files keep theirs (paths are by document id), and every share and export
    // takes the new one. Returns whether anything changed.
    rename(doc: LibraryDocument, rawName: string): boolean {
      const name = renamedTo(doc.name, rawName);
      if (!name) return false;
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: { name } });
      snack(t('library.renamed', { name }));
      return true;
    },

    // "Move" (K6): files documents under one course, or Unsorted (null). Only the course id
    // changes, never the files, so it's one quick write however many are moved.
    move(docs: readonly LibraryDocument[], courseId: string | null): void {
      if (docs.length === 0) return;
      const ids = docs.map((d) => d.id);
      dispatch({ type: 'library/ASSIGN_COURSE', ids, courseId });
      const name = courseId ? courses.find((c) => c.id === courseId)?.name : t('common.unsorted');
      snack(t('library.moved', { count: ids.length, name: name ?? t('library.movedFallback') }));
    },

    toggleStar(doc: LibraryDocument): void {
      dispatch({ type: 'library/TOGGLE_STAR', id: doc.id });
      snack(doc.star ? t('library.unstarred') : t('library.starred'));
    },

    // One file per page. The document is replaced by its pages, so whoever shows it leaves first
    // (`leave`, after the work and before the swap: a failure stays where it was). The marks go
    // with their pages.
    // §17 U13: both show the task toast while they work ("Splitting… 3 of 12").
    async split(doc: LibraryDocument, annotations: readonly Annotation[], leave?: () => void): Promise<void> {
      await runWithToast(
        dispatch,
        'library.splitting',
        async (task) => {
          const split = await libraryOps().splitDocument(doc, annotations.filter((a) => a.documentId === doc.id), task.progress);
          leave?.();
          dispatch({ type: 'library/REPLACE_FILES', ids: [doc.id], files: split });
          deleteDocumentFiles(doc.id);
          return split.length;
        },
        { done: (count) => t('library.splitInto', { count }), failed: toolFailure, haptic: true }
      );
    },

    async compress(doc: LibraryDocument): Promise<void> {
      await runWithToast(dispatch, 'library.compressing', (task) => compressDocuments([doc], dispatch, 2, task), { done: (msg) => msg, failed: toolFailure, haptic: true });
    },
  };
}

export type DocumentActions = ReturnType<typeof documentActions>;

export function useDocumentActions(): DocumentActions {
  const dispatch = useAppDispatch();
  const courses = useAppSelector((s) => s.library.courses);
  return useMemo(() => documentActions(dispatch, courses), [dispatch, courses]);
}
