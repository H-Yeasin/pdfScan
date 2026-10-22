import { makeDoc, makePage } from '../../../test/fixtures';
import type { Course, Semester } from '../../../types/models';
import {
  continueDocuments,
  continueProgress,
  courseActivity,
  currentSemester,
  dayPart,
  greetingName,
  homeCourses,
  homeSemester,
  moveCourse,
  normalizeRecentOpened,
  passMinutesLeft,
  pushRecentOpened,
  RECENT_OPENED_MAX,
  recentFiles,
  relativeDay,
} from '../homeSelectors';

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

describe('continueDocuments', () => {
  const older = makeDoc({ id: 'older', createdAt: 100 });
  const newer = makeDoc({ id: 'newer', createdAt: 200 });
  const third = makeDoc({ id: 'third', createdAt: 50 });
  const fourth = makeDoc({ id: 'fourth', createdAt: 40 });

  it('is empty for an empty library', () => {
    expect(continueDocuments([], [{ id: 'x', at: 1 }])).toEqual([]);
  });

  it('lists the opened documents newest first, with the newest save where it falls', () => {
    const items = continueDocuments([older, newer, third], [
      { id: 'older', at: 250 },
      { id: 'third', at: 150 },
    ]);
    expect(items.map((i) => [i.doc.id, i.reason])).toEqual([
      ['older', 'opened'],
      ['newer', 'saved'],
      ['third', 'opened'],
    ]);
  });

  it('keeps at most three', () => {
    const recent = [
      { id: 'older', at: 400 },
      { id: 'third', at: 300 },
      { id: 'fourth', at: 250 },
    ];
    const items = continueDocuments([older, newer, third, fourth], recent);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.doc.id)).toEqual(['older', 'third', 'fourth']);
  });

  it('drops deleted and archived documents, and offers the newest save without any opened', () => {
    const archived = makeDoc({ id: 'gone', createdAt: 300, archived: true });
    expect(continueDocuments([older, newer, archived], [{ id: 'deleted', at: 999 }, { id: 'gone', at: 998 }])).toEqual([{ doc: newer, reason: 'saved' }]);
    expect(continueDocuments([older, newer], [])).toEqual([{ doc: newer, reason: 'saved' }]);
  });

  it("doesn't list the newest save twice when it was opened too", () => {
    expect(continueDocuments([older, newer], [{ id: 'newer', at: 210 }])).toEqual([{ doc: newer, reason: 'opened' }]);
  });
});

describe('the recent-opened list', () => {
  it('puts a document at the front once and stays short', () => {
    let list = pushRecentOpened([], { id: 'a', at: 1 });
    list = pushRecentOpened(list, { id: 'b', at: 2 });
    list = pushRecentOpened(list, { id: 'a', at: 3 });
    expect(list).toEqual([
      { id: 'a', at: 3 },
      { id: 'b', at: 2 },
    ]);
    for (let i = 0; i < 20; i++) list = pushRecentOpened(list, { id: `d${i}`, at: 10 + i });
    expect(list).toHaveLength(RECENT_OPENED_MAX);
  });

  it('reads back only well-formed entries, newest first', () => {
    expect(normalizeRecentOpened(undefined)).toEqual([]);
    expect(normalizeRecentOpened([{ id: 'a', at: 1 }, { id: 'b', at: 5 }, { id: 'a', at: 9 }, null, { id: 3, at: 1 }, 'x'])).toEqual([
      { id: 'b', at: 5 },
      { id: 'a', at: 1 },
    ]);
  });
});

describe('continueProgress', () => {
  const pages = [makePage({ id: 'p1' }), makePage({ id: 'p2' }), makePage({ id: 'p3' })];

  it('finds the page by its id, else its index', () => {
    expect(continueProgress(makeDoc({ pages, lastPosition: { kind: 'page', pageId: 'p2', index: 0, fy: 0.3 } }))).toEqual({ page: 2, count: 3 });
    expect(continueProgress(makeDoc({ pages, lastPosition: { kind: 'page', pageId: 'gone', index: 2, fy: 0 } }))).toEqual({ page: 3, count: 3 });
    expect(continueProgress(makeDoc({ pages, lastPosition: { kind: 'page', index: 9, fy: 0 } }))).toEqual({ page: 3, count: 3 });
  });

  it('falls back on lastPage for a standard layout only', () => {
    expect(continueProgress(makeDoc({ pages, lastPage: 2 }))).toEqual({ page: 2, count: 3 });
    expect(continueProgress(makeDoc({ pages, lastPage: 2, pdfLayout: '2_in_1' }))).toBeNull();
  });

  it('is null when never read or not read by pages', () => {
    expect(continueProgress(makeDoc({ pages }))).toBeNull();
    expect(continueProgress(makeDoc({ format: 'DOCX', pages: [], lastPosition: { kind: 'docx', fraction: 0.5 } }))).toBeNull();
  });
});

describe('recentFiles', () => {
  it('gives the newest five, archived ones left out', () => {
    const files = Array.from({ length: 7 }, (_, i) => makeDoc({ id: `d${i}`, createdAt: i, archived: i === 6 }));
    expect(recentFiles(files).map((f) => f.id)).toEqual(['d5', 'd4', 'd3', 'd2', 'd1']);
  });
});

describe('the greeting', () => {
  it("uses the first word of the profile's name, or none", () => {
    expect(greetingName({ name: '  Rahim Uddin ' })).toBe('Rahim');
    expect(greetingName({ name: '   ' })).toBeNull();
  });

  it.each([
    [6, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [2, 'evening'],
  ] as const)('at %i is %s', (hour, part) => {
    expect(dayPart(hour)).toBe(part);
  });
});

describe('passMinutesLeft', () => {
  it('rounds up and never goes below zero', () => {
    expect(passMinutesLeft(60_000 * 42, 0)).toBe(42);
    expect(passMinutesLeft(30_000, 0)).toBe(1);
    expect(passMinutesLeft(0, 5)).toBe(0);
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
