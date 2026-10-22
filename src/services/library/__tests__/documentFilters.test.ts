import { makeDoc } from '../../../test/fixtures';
import {
  activeFilterChips,
  activeFilterCount,
  applyFilters,
  hasFilters,
  importCourseId,
  NO_FILTERS,
  toggleIn,
  UNSORTED_COURSE_ID,
  withoutChip,
  type DocumentFilters,
} from '../documentFilters';

// §17 U7: Files' filters.
const docs = [
  makeDoc({ id: 'math-hw', courseId: 'math', docType: 'assignment', star: true }),
  makeDoc({ id: 'math-notes', courseId: 'math', docType: 'notes' }),
  makeDoc({ id: 'phys-lab', courseId: 'phys', docType: 'lab' }),
  makeDoc({ id: 'loose', docType: undefined }),
  makeDoc({ id: 'old', courseId: 'math', docType: 'notes', archived: true }),
];
const ctx = { submittedIds: new Set(['math-hw']), bookmarkedIds: new Set(['phys-lab']), searching: false };
const ids = (filters: Partial<DocumentFilters>, over: Partial<typeof ctx> = {}) =>
  applyFilters(docs, { ...NO_FILTERS, ...filters }, { ...ctx, ...over }).map((d) => d.id);

describe('documentFilters.applyFilters', () => {
  it('hides only archived documents with no filters', () => {
    expect(ids({})).toEqual(['math-hw', 'math-notes', 'phys-lab', 'loose']);
  });

  it('shows archived ones when asked, and always while searching', () => {
    expect(ids({ showArchived: true })).toContain('old');
    expect(ids({}, { searching: true })).toContain('old');
  });

  it('matches any of the picked courses, Unsorted for no course', () => {
    expect(ids({ courseIds: ['phys', UNSORTED_COURSE_ID] })).toEqual(['phys-lab', 'loose']);
  });

  it('matches any of the picked types; no type is Other', () => {
    expect(ids({ types: ['notes', 'other'] })).toEqual(['math-notes', 'loose']);
  });

  it('filters by submitted, not submitted, bookmarked and starred', () => {
    expect(ids({ submitted: 'submitted' })).toEqual(['math-hw']);
    expect(ids({ submitted: 'notSubmitted' })).toEqual(['math-notes', 'phys-lab', 'loose']);
    expect(ids({ bookmarked: true })).toEqual(['phys-lab']);
    expect(ids({ starred: true })).toEqual(['math-hw']);
  });

  it('combines every filter (all must hold)', () => {
    expect(ids({ courseIds: ['math'], types: ['assignment', 'notes'], submitted: 'notSubmitted' })).toEqual(['math-notes']);
    expect(ids({ courseIds: ['math'], types: ['notes'], showArchived: true })).toEqual(['math-notes', 'old']);
    expect(ids({ courseIds: ['phys'], starred: true })).toEqual([]);
  });

  it('keeps the order it was given', () => {
    expect(applyFilters([...docs].reverse(), NO_FILTERS, ctx).map((d) => d.id)).toEqual(['loose', 'phys-lab', 'math-notes', 'math-hw']);
  });
});

describe('documentFilters chips and counts', () => {
  const filters: DocumentFilters = { ...NO_FILTERS, courseIds: ['math', 'phys'], types: ['lab'], submitted: 'submitted', bookmarked: true, showArchived: true, starred: true };

  it('counts each course and type, not Starred (it has its own chip)', () => {
    expect(activeFilterCount(filters)).toBe(6);
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(hasFilters({ ...NO_FILTERS, starred: true })).toBe(true);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it('gives a removable chip per filter, and removing one drops only it', () => {
    const chips = activeFilterChips(filters);
    expect(chips).toHaveLength(6);
    expect(withoutChip(filters, chips[0])).toEqual({ ...filters, courseIds: ['phys'] });
    expect(withoutChip(filters, { kind: 'type', type: 'lab' }).types).toEqual([]);
    expect(withoutChip(filters, { kind: 'submitted' }).submitted).toBe('any');
    expect(withoutChip(filters, { kind: 'bookmarked' }).bookmarked).toBe(false);
    expect(withoutChip(filters, { kind: 'archived' }).showArchived).toBe(false);
  });

  it('toggles a value in a list', () => {
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('files an import under the one course the list is filtered to', () => {
    expect(importCourseId({ ...NO_FILTERS, courseIds: ['math'] })).toBe('math');
    expect(importCourseId({ ...NO_FILTERS, courseIds: [UNSORTED_COURSE_ID] })).toBeUndefined();
    expect(importCourseId({ ...NO_FILTERS, courseIds: ['math', 'phys'] })).toBeUndefined();
    expect(importCourseId(NO_FILTERS)).toBeUndefined();
  });
});
