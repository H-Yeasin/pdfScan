import { DEFAULT_SORT, isSortKey, type DocumentSort } from './documentSort';

// §17 U7: how Files lists documents on this phone - the order and list or grid. Saved with the
// settings (per device; a backup doesn't carry it). The filters are not: they are what the
// student is looking for now (libraryUi), and a list that opens narrowed by a forgotten filter
// looks like documents went missing.
export type FilesLayout = 'list' | 'grid';
export type FilesView = { sort: DocumentSort; layout: FilesLayout };

export const DEFAULT_FILES_VIEW: FilesView = { sort: DEFAULT_SORT, layout: 'list' };

// Whatever was stored (nothing before U7, or a hand-edited value) as a usable view.
export function normalizeFilesView(raw: unknown): FilesView {
  if (!raw || typeof raw !== 'object') return DEFAULT_FILES_VIEW;
  const value = raw as { sort?: { key?: unknown; dir?: unknown }; layout?: unknown };
  const key = isSortKey(value.sort?.key) ? value.sort.key : DEFAULT_SORT.key;
  const dir = value.sort?.dir === 'asc' || value.sort?.dir === 'desc' ? value.sort.dir : DEFAULT_SORT.dir;
  return { sort: { key, dir }, layout: value.layout === 'grid' ? 'grid' : 'list' };
}
