import { makeDoc } from '../../../test/fixtures';
import { coursePageItemKey, coursePageItems, initialOpenSections, toggleSection, type CoursePageInput } from '../coursePage';

// §17 U11: a course page is one list; its sections are closed headers with counts that open in place.
const base: CoursePageInput = {
  docs: [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })],
  totalDocs: 2,
  archivedCount: 0,
  showArchived: false,
  typeFiltered: false,
  counts: { deadlines: 2, bookmarks: 5, submissions: 1 },
  open: new Set(),
};

const kinds = (input: CoursePageInput) => coursePageItems(input).map(coursePageItemKey);

describe('coursePageItems', () => {
  it('lists the documents first, then the sections closed, each with its count', () => {
    const items = coursePageItems(base);
    expect(items.map(coursePageItemKey)).toEqual(['documentsHeader', 'a', 'b', 'section:deadlines', 'section:bookmarks', 'section:submissions']);
    expect(items[0]).toEqual({ kind: 'documentsHeader', count: 2 });
    expect(items.filter((i) => i.kind === 'section')).toEqual([
      { kind: 'section', id: 'deadlines', count: 2, open: false },
      { kind: 'section', id: 'bookmarks', count: 5, open: false },
      { kind: 'section', id: 'submissions', count: 1, open: false },
    ]);
  });

  it('opens a section in place, under its own header', () => {
    expect(kinds({ ...base, open: new Set(['bookmarks']) })).toEqual([
      'documentsHeader',
      'a',
      'b',
      'section:deadlines',
      'section:bookmarks',
      'sectionBody:bookmarks',
      'section:submissions',
    ]);
  });

  it('leaves out a section with nothing to show (null), but keeps one at 0', () => {
    expect(kinds({ ...base, counts: { deadlines: 0, bookmarks: null, submissions: null } })).toEqual(['documentsHeader', 'a', 'b', 'section:deadlines']);
  });

  it('says why a course with documents shows none, and offers the archived ones', () => {
    const hidden = { ...base, docs: [], archivedCount: 2 };
    expect(coursePageItems(hidden).slice(0, 3)).toEqual([
      { kind: 'documentsHeader', count: 0 },
      { kind: 'documentsEmpty', filtered: false },
      { kind: 'archivedToggle', count: 2, showing: false },
    ]);
    expect(coursePageItems({ ...hidden, typeFiltered: true })[1]).toEqual({ kind: 'documentsEmpty', filtered: true });
    // An empty course says so in its header instead.
    expect(kinds({ ...base, docs: [], totalDocs: 0 })[1]).toBe('section:deadlines');
  });
});

describe('open sections', () => {
  it('start closed, except Deadlines when a reminder points at one', () => {
    expect([...initialOpenSections(null)]).toEqual([]);
    expect([...initialOpenSections('d1')]).toEqual(['deadlines']);
  });

  it('toggle without changing the old set', () => {
    const open = new Set<'deadlines' | 'bookmarks' | 'submissions'>(['deadlines']);
    expect([...toggleSection(open, 'bookmarks')].sort()).toEqual(['bookmarks', 'deadlines']);
    expect([...toggleSection(open, 'deadlines')]).toEqual([]);
    expect([...open]).toEqual(['deadlines']);
  });
});
