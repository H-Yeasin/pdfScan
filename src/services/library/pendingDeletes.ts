import { deleteDocumentFiles } from '../persistence/libraryFiles';

// §17 U7: a merge or split that deletes the originals takes their rows out of the library at once
// but keeps their folders until the Undo snack is over, so Undo can put them back whole. The
// folders go when the window ends; Undo before that cancels it.
//
// Longer than the snack is on screen (Snackbar's AUTO_DISMISS_MS), so a snack that waited in the
// queue behind another still offers a working Undo for most of its time. If the app is closed
// inside the window the folders stay behind as orphans, which Settings → Storage cleans; a row
// is never left without its files.
export const UNDO_WINDOW_MS = 8000;

type Pending = { ids: readonly string[]; timer: ReturnType<typeof setTimeout> };

const pending = new Map<number, Pending>();
let nextToken = 1;

function deleteFolders(ids: readonly string[]): void {
  for (const id of ids) {
    try {
      deleteDocumentFiles(id);
    } catch (error) {
      console.warn('pendingDeletes: could not delete the files of', id, error);
    }
  }
}

// Returns the token Undo passes to cancelDelete.
export function scheduleDelete(ids: readonly string[], windowMs = UNDO_WINDOW_MS): number {
  const token = nextToken++;
  const timer = setTimeout(() => {
    pending.delete(token);
    deleteFolders(ids);
  }, windowMs);
  pending.set(token, { ids, timer });
  return token;
}

// True when the folders were still there (Undo can restore the rows); false when the window was
// already over.
export function cancelDelete(token: number): boolean {
  const entry = pending.get(token);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(token);
  return true;
}
