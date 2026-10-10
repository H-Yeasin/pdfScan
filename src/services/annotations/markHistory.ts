import type { Annotation } from '../../types/models';

// §18 W15: Mark mode's undo and redo, pure. Every mark goes to the store the moment it is made;
// the history only remembers what was done, so it can be taken back and done again. It lasts as
// long as the Mark tool is open.

export type MarkChange =
  | { kind: 'added'; annotation: Annotation }
  | { kind: 'removed'; annotation: Annotation }
  | { kind: 'edited'; before: Annotation; after: Annotation };

export type MarkHistory = { undo: readonly MarkChange[]; redo: readonly MarkChange[] };

export const EMPTY_HISTORY: MarkHistory = { undo: [], redo: [] };

// What the store is told for a change done ('do') or taken back ('undo').
export type MarkAction =
  | { type: 'library/ADD_ANNOTATION'; annotation: Annotation }
  | { type: 'library/DELETE_ANNOTATIONS'; ids: string[] }
  | { type: 'library/UPDATE_ANNOTATION'; id: string; patch: Annotation };

export function changeAction(change: MarkChange, direction: 'do' | 'undo'): MarkAction {
  const forward = direction === 'do';
  if (change.kind === 'edited') {
    const to = forward ? change.after : change.before;
    return { type: 'library/UPDATE_ANNOTATION', id: to.id, patch: to };
  }
  // Adding done, or removing undone, puts the row there; the other two take it away.
  return (change.kind === 'added') === forward
    ? { type: 'library/ADD_ANNOTATION', annotation: change.annotation }
    : { type: 'library/DELETE_ANNOTATIONS', ids: [change.annotation.id] };
}

// A new change: it can be undone, and whatever had been undone can no longer be redone.
export function recordChange(history: MarkHistory, change: MarkChange): MarkHistory {
  return { undo: [...history.undo, change], redo: [] };
}

// The last change taken back (null: nothing to undo), and the action that does it.
export function undoChange(history: MarkHistory): { history: MarkHistory; action: MarkAction; change: MarkChange } | null {
  const change = history.undo[history.undo.length - 1];
  if (!change) return null;
  return { history: { undo: history.undo.slice(0, -1), redo: [...history.redo, change] }, action: changeAction(change, 'undo'), change };
}

export function redoChange(history: MarkHistory): { history: MarkHistory; action: MarkAction; change: MarkChange } | null {
  const change = history.redo[history.redo.length - 1];
  if (!change) return null;
  return { history: { undo: [...history.undo, change], redo: history.redo.slice(0, -1) }, action: changeAction(change, 'do'), change };
}

// An edit of a row (a note's words, a text box moved, a signature moved): the row as it becomes,
// stamped now, so whatever is keyed on `updatedAt` (the export copy, the overlay's shapes) knows.
export function editChange(before: Annotation, patch: Partial<Pick<Annotation, 'data' | 'text'>>, now: number = Date.now()): MarkChange {
  return { kind: 'edited', before, after: { ...before, ...patch, updatedAt: now } };
}

// The page a change is on (the Reader returns to the page last marked).
export function changedPageId(change: MarkChange): string {
  return change.kind === 'edited' ? change.after.pageId : change.annotation.pageId;
}
