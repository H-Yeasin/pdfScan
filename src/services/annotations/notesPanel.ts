import { tDoc } from '../../i18n';
import type { Annotation, Bookmark, LibraryDocument } from '../../types/models';
import { HIGHLIGHT_COLORS, PEN_COLORS } from './palette';
import { isRectMark } from './marks';

// §12 D4: the Reader's notes panel. A document's highlights, underlines, strikes, notes and
// bookmarks as one list by page, filtered by kind or colour, and exported as plain text. Pen
// strokes are left out: a drawing has nothing to read in a list. Pure, so the order, filters and
// export format are tested without rendering.

export type NoteKind = 'highlight' | 'underline' | 'strike' | 'note' | 'bookmark';
export const NOTE_KINDS: readonly NoteKind[] = ['highlight', 'underline', 'strike', 'note', 'bookmark'];

export type NoteEntry = {
  // The annotation's or bookmark's id.
  id: string;
  kind: NoteKind;
  // Library page index (0-based).
  pageIdx: number;
  // A palette key (annotations/palette.ts) for marks and notes; none for a bookmark.
  color?: string;
  // The marked words, the note itself, or the bookmark's label.
  text: string;
  // Where it sits on the page (master pixels from the top), for the order within a page.
  y: number;
  createdAt: number;
};

// Highlight, underline, strike: marked words, with a colour to filter by.
function isMarkEntry(kind: NoteKind): boolean {
  return kind === 'highlight' || kind === 'underline' || kind === 'strike';
}

export type NotesGroup = { pageIdx: number; entries: NoteEntry[] };

export type NotesFilter = { kind: NoteKind | 'all'; color: string | 'all' };
export const ALL_NOTES: NotesFilter = { kind: 'all', color: 'all' };

function annotationY(a: Annotation): number {
  const data = a.data;
  if ('rects' in data) return data.rects.length ? Math.min(...data.rects.map((r) => r.top)) : 0;
  if ('y' in data) return data.y;
  if ('box' in data) return data.box.top;
  return 0;
}

// One document's entries in page order; on a page, a bookmark first (it marks the whole page),
// then top to bottom, then oldest first. Entries whose page is gone are left out.
export function documentNotes(
  doc: Pick<LibraryDocument, 'id' | 'pages'>,
  annotations: readonly Annotation[],
  bookmarks: readonly Bookmark[]
): NoteEntry[] {
  const pageIdx = new Map(doc.pages.map((p, i) => [p.id, i]));
  const out: NoteEntry[] = [];
  for (const a of annotations) {
    if (a.documentId !== doc.id || !(isRectMark(a.kind) || a.kind === 'note')) continue;
    const idx = pageIdx.get(a.pageId);
    if (idx === undefined) continue;
    out.push({ id: a.id, kind: a.kind as NoteKind, pageIdx: idx, color: a.color, text: (a.text ?? '').trim(), y: annotationY(a), createdAt: a.createdAt });
  }
  for (const b of bookmarks) {
    if (b.documentId !== doc.id) continue;
    const idx = pageIdx.get(b.pageId);
    if (idx === undefined) continue;
    out.push({ id: b.id, kind: 'bookmark', pageIdx: idx, text: (b.label ?? '').trim(), y: -Infinity, createdAt: b.createdAt });
  }
  return out.sort((a, b) => a.pageIdx - b.pageIdx || a.y - b.y || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

// Colour filters only apply to marks: a note has one fixed colour and a bookmark none, so with a
// colour picked only marks of that colour show.
export function filterNotes(entries: readonly NoteEntry[], filter: NotesFilter): NoteEntry[] {
  return entries.filter(
    (e) => (filter.kind === 'all' || e.kind === filter.kind) && (filter.color === 'all' || (isMarkEntry(e.kind) && e.color === filter.color))
  );
}

const COLOR_ORDER: readonly string[] = [...Object.keys(HIGHLIGHT_COLORS), ...Object.keys(PEN_COLORS)];

// The filter chips worth showing: the kinds present, and the mark colours present (in palette
// order). A single kind or colour isn't a choice, so it gives no chips.
export function notesFilterOptions(entries: readonly NoteEntry[]): { kinds: NoteKind[]; colors: string[] } {
  const kinds = NOTE_KINDS.filter((k) => entries.some((e) => e.kind === k));
  const colors = COLOR_ORDER.filter((c) => entries.some((e) => isMarkEntry(e.kind) && e.color === c));
  return { kinds: kinds.length > 1 ? kinds : [], colors: colors.length > 1 ? colors : [] };
}

export function groupNotesByPage(entries: readonly NoteEntry[]): NotesGroup[] {
  const groups: NotesGroup[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.pageIdx === e.pageIdx) last.entries.push(e);
    else groups.push({ pageIdx: e.pageIdx, entries: [e] });
  }
  return groups;
}

// The words pdf-jsi searches for to flash a mark after jumping to its page. A mark over several
// lines may not match as one phrase in the PDF's text, so only its first words are searched.
const FLASH_WORDS = 5;
export function flashQuery(entry: Pick<NoteEntry, 'kind' | 'text'>): string | null {
  if (!isMarkEntry(entry.kind)) return null;
  const words = entry.text.split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, FLASH_WORDS).join(' ') : null;
}

// The text of an export, in the document language: the caller passes tDoc-backed labels so this
// stays pure.
export type NotesExportLabels = {
  title: string;
  page: (page: number) => string;
  kind: Record<NoteKind, string>;
  // "Highlight: “words”" for marked words; "Note: text" for a note or bookmark label.
  quoted: (kind: string, text: string) => string;
  plain: (kind: string, text: string) => string;
};

export function notesExportLabels(name: string): NotesExportLabels {
  return {
    title: tDoc('document.notesExport.title', { name }),
    page: (page) => tDoc('document.notesExport.page', { page }),
    kind: {
      highlight: tDoc('document.notesExport.kind.highlight'),
      underline: tDoc('document.notesExport.kind.underline'),
      strike: tDoc('document.notesExport.kind.strike'),
      note: tDoc('document.notesExport.kind.note'),
      bookmark: tDoc('document.notesExport.kind.bookmark'),
    },
    quoted: (kind, text) => tDoc('document.notesExport.quoted', { kind, text }),
    plain: (kind, text) => tDoc('document.notesExport.plain', { kind, text }),
  };
}

// Plain text that any app opens, e.g.
//   HW3: notes
//
//   Page 2
//   - Bookmark: Formula sheet
//   - Highlight: “light energy becomes chemical energy”
//   - Note: ask about the Calvin cycle
// A note over several lines keeps them, indented under its dash.
export function formatNotesExport(entries: readonly NoteEntry[], labels: NotesExportLabels): string {
  const lines: string[] = [labels.title];
  for (const group of groupNotesByPage(entries)) {
    lines.push('', labels.page(group.pageIdx + 1));
    for (const e of group.entries) {
      const kind = labels.kind[e.kind];
      const text = e.text.replace(/\r\n?/g, '\n').replace(/\n/g, '\n  ');
      const line = !text ? kind : e.kind === 'note' || e.kind === 'bookmark' ? labels.plain(kind, text) : labels.quoted(kind, text);
      lines.push(`- ${line}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
