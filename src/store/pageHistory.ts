import type { AppAction } from './appReducer';
import type { SessionPage } from '../types/models';

// Undo/redo for page edits in Review. Pure functions; appReducer is the only caller, because an
// undo reads the history (review slice) and rewrites the pages (capture slice) in one step.
//
// Two kinds of entry:
//  - 'fields': the edited fields of the pages an action touched, as they were before it. Undo
//    puts those fields back on the same page ids and leaves everything else alone, so OCR results
//    or pages added after the edit survive the undo.
//  - 'pages': the whole page list, for the actions that change it (merge, delete). Undo restores
//    the list as it was.
// Crop, rotate and sign write new image files and only change `uri`, so undoing them just points
// back at the previous file. Those files stay in the cache until the session ends
// (historyUris + Deliver's cache sweep), because redo or undo may still need them.

export const HISTORY_LIMIT = 20;

const EDITED_FIELDS = ['enhance', 'adjust', 'filterOptions', 'rotation', 'uri', 'width', 'height', 'cropRect'] as const;
type EditedField = (typeof EDITED_FIELDS)[number];
export type PageSnapshot = { id: string } & Pick<SessionPage, EditedField>;

export type HistoryEntry = { kind: 'fields'; pages: PageSnapshot[] } | { kind: 'pages'; pages: SessionPage[] };
export type PageHistory = { past: HistoryEntry[]; future: HistoryEntry[] };

export const emptyHistory: PageHistory = { past: [], future: [] };

function snapshotPage(page: SessionPage): PageSnapshot {
  const snap = { id: page.id } as PageSnapshot;
  for (const field of EDITED_FIELDS) (snap as Record<string, unknown>)[field] = page[field];
  return snap;
}

function fieldsEntry(pages: SessionPage[], ids: string[] | 'all'): HistoryEntry | null {
  const touched = ids === 'all' ? pages : pages.filter((p) => ids.includes(p.id));
  return touched.length ? { kind: 'fields', pages: touched.map(snapshotPage) } : null;
}

// The entry to record BEFORE `action` runs against `pages`, or null if the action isn't a page
// edit (selection, OCR results, stats, reordering, adding pages).
export function historyEntryFor(pages: SessionPage[], action: AppAction): HistoryEntry | null {
  switch (action.type) {
    case 'capture/SET_PAGE_ENHANCE':
    case 'capture/SET_PAGE_ADJUST':
      return fieldsEntry(pages, [action.id]);
    case 'capture/SET_ALL_PAGES_ENHANCE':
    case 'capture/SET_ALL_PAGES_ADJUST':
    case 'capture/APPLY_LOOK_TO_ALL':
      return fieldsEntry(pages, 'all');
    case 'capture/SET_FILTER_OPTIONS':
      return fieldsEntry(pages, action.id === null ? 'all' : [action.id]);
    case 'capture/UPDATE_PAGE':
      // OCR results and the err flag also arrive through UPDATE_PAGE; only edits are undoable.
      return EDITED_FIELDS.some((field) => field in action.patch) ? fieldsEntry(pages, [action.id]) : null;
    case 'capture/REPLACE_PAGES':
    case 'capture/REMOVE_PAGE':
      return { kind: 'pages', pages };
    default:
      return null;
  }
}

// True when the action left every recorded field as it was (re-picking the selected filter, or
// "apply to all" on pages that already match), so it isn't worth an undo step. Shallow per field:
// reducers replace an object field (adjust, filterOptions) only when it's set.
export function changedAnything(entry: HistoryEntry, after: SessionPage[]): boolean {
  if (entry.kind === 'pages') return entry.pages !== after;
  const byId = new Map(after.map((p) => [p.id, p]));
  return entry.pages.some((snap) => {
    const page = byId.get(snap.id);
    return !page || EDITED_FIELDS.some((field) => page[field] !== snap[field]);
  });
}

export function pushEntry(history: PageHistory, entry: HistoryEntry): PageHistory {
  // A new edit forks the timeline, so whatever was undone can no longer be redone.
  return { past: [...history.past, entry].slice(-HISTORY_LIMIT), future: [] };
}

// Applies `entry` to `pages` and returns the result plus the entry that reverses it (what the
// other stack needs), so undo and redo are the same operation in opposite directions.
export function applyEntry(pages: SessionPage[], entry: HistoryEntry): { pages: SessionPage[]; inverse: HistoryEntry } {
  if (entry.kind === 'pages') return { pages: entry.pages, inverse: { kind: 'pages', pages } };
  const byId = new Map(entry.pages.map((snap) => [snap.id, snap]));
  const inverse: PageSnapshot[] = [];
  const next = pages.map((page) => {
    const snap = byId.get(page.id);
    if (!snap) return page;
    inverse.push(snapshotPage(page));
    const restored: SessionPage = { ...page, ...snap };
    // Same invariant as capture/UPDATE_PAGE: stats describe the pixels of `uri`.
    if (restored.uri !== page.uri) delete restored.stats;
    return restored;
  });
  return { pages: next, inverse: { kind: 'fields', pages: inverse } };
}

export function undo(pages: SessionPage[], history: PageHistory): { pages: SessionPage[]; history: PageHistory } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  const { pages: next, inverse } = applyEntry(pages, entry);
  return { pages: next, history: { past: history.past.slice(0, -1), future: [...history.future, inverse] } };
}

export function redo(pages: SessionPage[], history: PageHistory): { pages: SessionPage[]; history: PageHistory } | null {
  const entry = history.future[history.future.length - 1];
  if (!entry) return null;
  const { pages: next, inverse } = applyEntry(pages, entry);
  return { pages: next, history: { past: [...history.past, inverse], future: history.future.slice(0, -1) } };
}

// Every image uri a history entry could restore. These files must outlive the edit that replaced
// them, so the end-of-session cache sweep (DeliverScreen) deletes them instead.
export function historyUris(history: PageHistory): string[] {
  const uris = new Set<string>();
  for (const entry of [...history.past, ...history.future]) for (const page of entry.pages) uris.add(page.uri);
  return Array.from(uris);
}
