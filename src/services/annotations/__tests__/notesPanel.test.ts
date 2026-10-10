import { makeDoc, makePage } from '../../../test/fixtures';
import type { Annotation, Bookmark } from '../../../types/models';
import {
  ALL_NOTES,
  documentNotes,
  filterNotes,
  flashRects,
  formatNotesExport,
  groupNotesByPage,
  notesExportLabels,
  notesFilterOptions,
} from '../notesPanel';

const doc = makeDoc({ id: 'd', name: 'HW3', pages: [makePage({ id: 'p1' }), makePage({ id: 'p2' }), makePage({ id: 'p3' })] });
const rect = (top: number) => ({ rects: [{ left: 100, top, width: 200, height: 30 }] });

let n = 0;
function mark(over: Partial<Annotation>): Annotation {
  n += 1;
  return { id: `a${n}`, documentId: 'd', pageId: 'p1', kind: 'highlight', color: 'yellow', data: rect(100), createdAt: n, updatedAt: n, ...over };
}
const bookmark = (over: Partial<Bookmark>): Bookmark => ({ id: 'b1', documentId: 'd', pageId: 'p2', createdAt: 1, ...over });

describe('§12 D4 notes panel', () => {
  const annotations = [
    mark({ id: 'low', pageId: 'p2', data: rect(900), text: 'lower words' }),
    mark({ id: 'note', pageId: 'p2', kind: 'note', color: 'note', data: { x: 50, y: 300 }, text: 'ask about this' }),
    mark({ id: 'high', pageId: 'p2', kind: 'underline', color: 'red', data: rect(200), text: 'upper words' }),
    mark({ id: 'first', pageId: 'p1', kind: 'strike', color: 'black', text: 'wrong answer' }),
    mark({ id: 'ink', pageId: 'p1', kind: 'ink', color: 'black', data: { strokes: [[[0, 0], [5, 5]]], width: 4 } }),
    mark({ id: 'gone', pageId: 'deleted' }),
    mark({ id: 'other', documentId: 'x' }),
  ];
  const bookmarks = [bookmark({ label: ' Formula sheet ' }), bookmark({ id: 'b2', documentId: 'x' })];

  it('lists marks, notes and bookmarks by page, a bookmark first, then top to bottom', () => {
    const entries = documentNotes(doc, annotations, bookmarks);
    expect(entries.map((e) => e.id)).toEqual(['first', 'b1', 'high', 'note', 'low']);
    expect(entries[1]).toMatchObject({ kind: 'bookmark', pageIdx: 1, text: 'Formula sheet' });
    expect(groupNotesByPage(entries).map((g) => [g.pageIdx, g.entries.length])).toEqual([
      [0, 1],
      [1, 4],
    ]);
  });

  it('keeps marks at the same height in the order they were made', () => {
    const entries = documentNotes(doc, [mark({ id: 'later', createdAt: 9 }), mark({ id: 'earlier', createdAt: 2 })], []);
    expect(entries.map((e) => e.id)).toEqual(['earlier', 'later']);
  });

  it('filters by kind and by mark colour', () => {
    const entries = documentNotes(doc, annotations, bookmarks);
    expect(filterNotes(entries, ALL_NOTES)).toHaveLength(5);
    expect(filterNotes(entries, { kind: 'note', color: 'all' }).map((e) => e.id)).toEqual(['note']);
    // A colour leaves out notes and bookmarks.
    expect(filterNotes(entries, { kind: 'all', color: 'red' }).map((e) => e.id)).toEqual(['high']);
    expect(filterNotes(entries, { kind: 'highlight', color: 'red' })).toEqual([]);
  });

  it('offers only the kinds and colours present, and none when there is no choice', () => {
    const entries = documentNotes(doc, annotations, bookmarks);
    expect(notesFilterOptions(entries)).toEqual({ kinds: ['highlight', 'underline', 'strike', 'note', 'bookmark'], colors: ['yellow', 'black', 'red'] });
    expect(notesFilterOptions(documentNotes(doc, [mark({})], []))).toEqual({ kinds: [], colors: [] });
  });

  it('flashes a mark where it is: its boxes, a note\'s icon, a drawing\'s bounds', () => {
    expect(flashRects({ data: rect(400) })).toEqual([{ left: 100, top: 400, width: 200, height: 30 }]);
    expect(flashRects({ data: { box: { left: 10, top: 20, width: 300, height: 80 }, size: 40 } })).toEqual([{ left: 10, top: 20, width: 300, height: 80 }]);
    // The icon is a 60 px square around its anchor.
    expect(flashRects({ data: { x: 500, y: 300 } })).toEqual([{ left: 470, top: 270, width: 60, height: 60 }]);
    // A stroke's bounds include half the pen's width.
    expect(
      flashRects({
        data: {
          strokes: [
            [
              [100, 100],
              [200, 150],
            ],
            [[50, 300]],
          ],
          width: 10,
        },
      })
    ).toEqual([{ left: 45, top: 95, width: 160, height: 210 }]);
    expect(flashRects({ data: { strokes: [], width: 4 } })).toEqual([]);
  });

  it('exports plain text with page numbers', () => {
    const entries = documentNotes(
      doc,
      [...annotations, mark({ id: 'multi', pageId: 'p3', kind: 'note', color: 'note', data: { x: 0, y: 0 }, text: 'line one\nline two' }), mark({ id: 'bare', pageId: 'p3', data: rect(500) })],
      [bookmark({ label: undefined, pageId: 'p3' })]
    );
    expect(formatNotesExport(entries, notesExportLabels('HW3'))).toBe(
      [
        'HW3: notes',
        '',
        'Page 1',
        '- Strike: “wrong answer”',
        '',
        'Page 2',
        '- Underline: “upper words”',
        '- Note: ask about this',
        '- Highlight: “lower words”',
        '',
        'Page 3',
        '- Bookmark',
        '- Note: line one',
        '  line two',
        '- Highlight',
        '',
      ].join('\n')
    );
  });
});
