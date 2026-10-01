import { makeDoc } from '../../../test/fixtures';
import type { Course, Semester } from '../../../types/models';
import { continueDocument, courseActivity, currentSemester, homeCourses, homeSemester, moveCourse, relativeDay } from '../homeSelectors';

const semester = (id: string, startsOn: string, endsOn?: string, archived = false): Semester => ({
  id,
  name: id,
  startsOn,
  endsOn,
  archived,
  createdAt: 0,
});

const course = (id: string, fields: Partial<Course> = {}): Course => ({
  id,
  name: id,
  color: 'teal',
  archived: false,
  sortOrder: 0,
  createdAt: 0,
  ...fields,
});

describe('currentSemester', () => {
  const spring = semester('spring', '2027-01-01', '2027-05-31');
  const fall = semester('fall', '2026-08-01', '2026-12-31');
  const summer = semester('summer', '2027-06-01', '2027-07-31');

  it('picks the semester whose dates contain today', () => {
    expect(currentSemester([spring, fall, summer], '2026-10-01')?.id).toBe('fall');
    expect(currentSemester([spring, fall, summer], '2027-06-15')?.id).toBe('summer');
  });

  it('prefers the later-starting one when terms overlap, and treats a missing end as open', () => {
    const openEnded = semester('open', '2026-09-15');
    expect(currentSemester([fall, openEnded], '2026-10-01')?.id).toBe('open');
  });

  it('between terms, keeps the last one that started', () => {
    expect(currentSemester([spring, fall], '2027-06-10')?.id).toBe('spring');
  });

  it('before any term starts, the soonest upcoming one; never an archived one', () => {
    expect(currentSemester([spring, fall], '2026-01-01')?.id).toBe('fall');
    expect(currentSemester([semester('old', '2026-08-01', '2026-12-31', true)], '2026-10-01')).toBeNull();
  });

  it('homeSemester honours an active pick and ignores an archived or missing one', () => {
    const archivedFall = { ...fall, archived: true };
    expect(homeSemester([spring, fall], 'spring', '2026-10-01')?.id).toBe('spring');
    expect(homeSemester([spring, archivedFall], 'fall', '2027-02-01')?.id).toBe('spring');
    expect(homeSemester([fall], 'gone', '2026-10-01')?.id).toBe('fall');
  });
});

describe('homeCourses', () => {
  const courses = [
    course('a', { semesterId: 'fall' }),
    course('b', { semesterId: 'spring' }),
    course('c'),
    course('d', { semesterId: 'fall', archived: true }),
  ];

  it("shows the semester's active courses plus courses without a semester", () => {
    expect(homeCourses(courses, semester('fall', '2026-08-01')).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('shows every active course when there is no semester', () => {
    expect(homeCourses(courses, null).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('courseActivity', () => {
  it('counts documents and finds the latest scan per course and for Unsorted', () => {
    const files = [
      makeDoc({ courseId: 'a', createdAt: 10 }),
      makeDoc({ courseId: 'a', createdAt: 30 }),
      makeDoc({ courseId: 'b', createdAt: 20 }),
      makeDoc({ createdAt: 5 }),
    ];
    const { byCourse, unsorted } = courseActivity(files);
    expect(byCourse.get('a')).toEqual({ count: 2, lastScanAt: 30 });
    expect(byCourse.get('b')).toEqual({ count: 1, lastScanAt: 20 });
    expect(byCourse.get('none')).toBeUndefined();
    expect(unsorted).toEqual({ count: 1, lastScanAt: 5 });
  });
});

describe('continueDocument', () => {
  const older = makeDoc({ id: 'older', createdAt: 100 });
  const newer = makeDoc({ id: 'newer', createdAt: 200 });

  it('is null for an empty library', () => {
    expect(continueDocument([], { id: 'x', at: 1 })).toBeNull();
  });

  it('offers the last opened document if it was opened after the newest save', () => {
    expect(continueDocument([older, newer], { id: 'older', at: 250 })).toEqual({ doc: older, reason: 'opened' });
  });

  it('offers the newest save if it came after the last open, or the opened one is gone', () => {
    expect(continueDocument([older, newer], { id: 'older', at: 150 })).toEqual({ doc: newer, reason: 'saved' });
    expect(continueDocument([older, newer], { id: 'deleted', at: 999 })).toEqual({ doc: newer, reason: 'saved' });
    expect(continueDocument([older, newer], null)).toEqual({ doc: newer, reason: 'saved' });
  });
});

describe('relativeDay', () => {
  const now = new Date(2026, 9, 1, 9).getTime();
  it.each([
    [new Date(2026, 9, 1, 0, 5).getTime(), 'Today'],
    [new Date(2026, 8, 30, 23).getTime(), 'Yesterday'],
    [new Date(2026, 8, 27, 12).getTime(), '4 days ago'],
  ])('%s -> %s', (at, label) => {
    expect(relativeDay(at, now)).toBe(label);
  });
});

describe('moveCourse', () => {
  // x is in another semester, so Home shows a, b, c and x sits between a and b in the full order.
  const all = ['a', 'x', 'b', 'c'].map((id) => course(id));
  const shown = ['a', 'b', 'c'];

  it('swaps with the visible neighbour, leaving hidden courses in place', () => {
    expect(moveCourse(all, shown, 'b', -1)).toEqual(['b', 'x', 'a', 'c']);
    expect(moveCourse(all, shown, 'b', 1)).toEqual(['a', 'x', 'c', 'b']);
  });

  it('is null at either end', () => {
    expect(moveCourse(all, shown, 'a', -1)).toBeNull();
    expect(moveCourse(all, shown, 'c', 1)).toBeNull();
  });
});
