import { initialLibraryState, libraryReducer } from '../../../store/slices/librarySlice';
import type { Course, Semester } from '../../../types/models';
import {
  defaultSemester,
  quickSetupActions,
  upcomingColors,
  validateCourseDraft,
  validateQuickSetup,
} from '../courseSetup';
import { COURSE_COLORS } from '../palette';

const course = (id: string, fields: Partial<Course> = {}): Course => ({
  id,
  name: id.toUpperCase(),
  color: 'teal',
  archived: false,
  sortOrder: 0,
  createdAt: 0,
  ...fields,
});

const fall: Semester = { id: 's_fall', name: 'Fall 2026', startsOn: '2026-08-01', archived: false, createdAt: 0 };

describe('defaultSemester', () => {
  it.each([
    [new Date(2027, 0, 15), 'Spring 2027', '2027-01-01', '2027-05-31'],
    [new Date(2027, 4, 31), 'Spring 2027', '2027-01-01', '2027-05-31'],
    [new Date(2027, 5, 1), 'Summer 2027', '2027-06-01', '2027-07-31'],
    [new Date(2026, 7, 1), 'Fall 2026', '2026-08-01', '2026-12-31'],
    [new Date(2026, 9, 1), 'Fall 2026', '2026-08-01', '2026-12-31'],
    [new Date(2026, 11, 31, 23, 59), 'Fall 2026', '2026-08-01', '2026-12-31'],
  ])('%s -> %s', (date, name, startsOn, endsOn) => {
    expect(defaultSemester(date)).toEqual({ name, startsOn, endsOn });
  });
});

describe('validateCourseDraft', () => {
  const courses = [
    course('math', { code: 'MATH 101', semesterId: 's_fall' }),
    course('old', { code: 'BIO 1', semesterId: 's_fall', archived: true }),
  ];

  it('requires a name', () => {
    expect(validateCourseDraft({ name: '   ' }, courses).name).toBeDefined();
    expect(validateCourseDraft({ name: 'Physics' }, courses)).toEqual({});
  });

  it('rejects a duplicate code in the same semester, compared loosely', () => {
    expect(validateCourseDraft({ name: 'X', code: 'math101', semesterId: 's_fall' }, courses).code).toMatch(/MATH/);
  });

  it('allows the same code in another semester, next to an archived course, or on itself', () => {
    expect(validateCourseDraft({ name: 'X', code: 'MATH 101', semesterId: 's_spring' }, courses)).toEqual({});
    expect(validateCourseDraft({ name: 'X', code: 'MATH 101' }, courses)).toEqual({});
    expect(validateCourseDraft({ name: 'X', code: 'BIO 1', semesterId: 's_fall' }, courses)).toEqual({});
    expect(validateCourseDraft({ name: 'Math', code: 'MATH 101', semesterId: 's_fall' }, courses, 'math')).toEqual({});
  });
});

describe('validateQuickSetup', () => {
  it('ignores blank rows and counts the rest', () => {
    const result = validateQuickSetup(
      [
        { name: 'Algebra', code: '' },
        { name: '', code: '' },
        { name: 'Biology', code: 'BIO' },
      ],
      'Fall 2026',
      [],
      []
    );
    expect(result).toEqual({ rowErrors: [{}, {}, {}], semesterError: undefined, count: 2 });
  });

  it('flags a code without a name, duplicate codes between rows, and an empty semester name', () => {
    const result = validateQuickSetup(
      [
        { name: '', code: 'CHEM' },
        { name: 'Calculus', code: 'MA 1' },
        { name: 'Calc again', code: 'ma1' },
      ],
      '  ',
      [],
      []
    );
    expect(result.rowErrors[0].name).toBeDefined();
    expect(result.rowErrors[1]).toEqual({});
    expect(result.rowErrors[2].code).toBe('Same code as row 2');
    expect(result.semesterError).toBeDefined();
  });

  it('checks codes against courses already in the same-named semester', () => {
    const existing = [course('math', { code: 'MATH 101', semesterId: 's_fall' })];
    const rows = [{ name: 'Maths', code: 'MATH 101' }];
    expect(validateQuickSetup(rows, 'fall 2026', existing, [fall]).rowErrors[0].code).toBeDefined();
    expect(validateQuickSetup(rows, 'Spring 2027', existing, [fall]).rowErrors[0]).toEqual({});
  });
});

describe('quickSetupActions', () => {
  let n = 0;
  const makeId = (prefix: string) => `${prefix}_${++n}`;
  beforeEach(() => {
    n = 0;
  });

  it('creates the semester and one course per filled row, coloured as previewed', () => {
    const rows = [
      { name: ' Algebra ', code: ' MA  101 ' },
      { name: '', code: '' },
      { name: 'Biology', code: '' },
    ];
    const actions = quickSetupActions(rows, 'Fall  2026', [], [], new Date(2026, 9, 1), makeId);
    const state = actions.reduce(libraryReducer, initialLibraryState);

    expect(state.semesters).toEqual([
      expect.objectContaining({ id: 'semester_1', name: 'Fall 2026', startsOn: '2026-08-01', endsOn: '2026-12-31' }),
    ]);
    expect(state.courses.map((c) => [c.name, c.code, c.color, c.semesterId, c.sortOrder])).toEqual([
      ['Algebra', 'MA 101', COURSE_COLORS[0], 'semester_1', 0],
      ['Biology', undefined, COURSE_COLORS[1], 'semester_1', 1],
    ]);
    expect(upcomingColors([], 2)).toEqual([COURSE_COLORS[0], COURSE_COLORS[1]]);
  });

  it('adds to an existing semester with the same name and continues the palette', () => {
    const existing = [course('math', { color: COURSE_COLORS[0], semesterId: 's_fall' })];
    const actions = quickSetupActions([{ name: 'Physics', code: '' }], 'FALL 2026', existing, [fall], new Date(), makeId);
    expect(actions).toEqual([
      {
        type: 'library/CREATE_COURSE',
        id: 'course_1',
        name: 'Physics',
        fields: { code: undefined, color: COURSE_COLORS[1], semesterId: 's_fall' },
      },
    ]);
  });
});
