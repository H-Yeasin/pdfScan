import { initialLibraryState, libraryReducer } from '../slices/librarySlice';
import type { LibraryAction, LibraryState } from '../slices/librarySlice';
import { COURSE_COLORS } from '../../services/courses/palette';
import { makeDoc } from '../../test/fixtures';

function run(...actions: LibraryAction[]): LibraryState {
  return actions.reduce(libraryReducer, initialLibraryState);
}

const createCourse = (id: string, fields?: Extract<LibraryAction, { type: 'library/CREATE_COURSE' }>['fields']): LibraryAction => ({
  type: 'library/CREATE_COURSE',
  id,
  name: id.toUpperCase(),
  fields,
});

describe('librarySlice courses', () => {
  it('gives new courses the next colour and the next position', () => {
    const state = run(createCourse('a'), createCourse('b'), createCourse('c', { color: 'slate', code: 'C1' }));
    expect(state.courses.map((c) => [c.id, c.color, c.sortOrder])).toEqual([
      ['a', COURSE_COLORS[0], 0],
      ['b', COURSE_COLORS[1], 1],
      ['c', 'slate', 2],
    ]);
    expect(state.courses[2]).toMatchObject({ code: 'C1', archived: false });
  });

  it('updates a course in place', () => {
    const state = run(createCourse('a'), {
      type: 'library/UPDATE_COURSE',
      id: 'a',
      patch: { name: 'Algebra', emoji: '➗', teacher: 'Ms. Ada' },
    });
    expect(state.courses[0]).toMatchObject({ id: 'a', name: 'Algebra', emoji: '➗', teacher: 'Ms. Ada', sortOrder: 0 });
  });

  it('reorders, keeping unmoved courses as the same objects', () => {
    const before = run(createCourse('a'), createCourse('b'), createCourse('c'), createCourse('d'));
    const after = libraryReducer(before, { type: 'library/REORDER_COURSES', ids: ['b', 'a'] });
    expect(after.courses.map((c) => [c.id, c.sortOrder])).toEqual([
      ['b', 0],
      ['a', 1],
      ['c', 2],
      ['d', 3],
    ]);
    // Only the moved courses are new objects, so persistence writes only those.
    expect(after.courses[2]).toBe(before.courses[2]);
    expect(after.courses[3]).toBe(before.courses[3]);
  });

  it('SET_COURSES sorts by sortOrder', () => {
    const [a, b] = run(createCourse('a'), createCourse('b')).courses;
    const state = run({ type: 'library/SET_COURSES', courses: [{ ...a, sortOrder: 5 }, b] });
    expect(state.courses.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('librarySlice semesters', () => {
  const fall = { id: 's_fall', name: 'Fall 2026', startsOn: '2026-09-01', endsOn: '2026-12-20' };
  const spring = { id: 's_spring', name: 'Spring 2027', startsOn: '2027-01-10' };

  function withTwoSemesters(): LibraryState {
    return run(
      { type: 'library/CREATE_SEMESTER', semester: fall },
      { type: 'library/CREATE_SEMESTER', semester: spring },
      createCourse('a', { semesterId: 's_fall' }),
      createCourse('b', { semesterId: 's_fall' }),
      createCourse('c', { semesterId: 's_spring' }),
      createCourse('d')
    );
  }

  it('creates and edits semesters', () => {
    let state = withTwoSemesters();
    expect(state.semesters.map((s) => s.id)).toEqual(['s_spring', 's_fall']);
    expect(state.semesters[1]).toMatchObject({ ...fall, archived: false });
    state = libraryReducer(state, { type: 'library/UPDATE_SEMESTER', id: 's_spring', patch: { endsOn: '2027-05-30' } });
    expect(state.semesters[0].endsOn).toBe('2027-05-30');
  });

  it('archiving a semester archives exactly its courses', () => {
    const before = withTwoSemesters();
    const after = libraryReducer(before, { type: 'library/ARCHIVE_SEMESTER', id: 's_fall' });
    expect(after.semesters.find((s) => s.id === 's_fall')?.archived).toBe(true);
    expect(after.semesters.find((s) => s.id === 's_spring')?.archived).toBe(false);
    expect(after.courses.map((c) => [c.id, c.archived])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
      ['d', false],
    ]);
    expect(after.courses[2]).toBe(before.courses[2]);
  });

  it('a new course after archiving starts the palette again', () => {
    const state = run(
      { type: 'library/CREATE_SEMESTER', semester: fall },
      createCourse('a', { semesterId: 's_fall' }),
      { type: 'library/ARCHIVE_SEMESTER', id: 's_fall' },
      createCourse('next')
    );
    expect(state.courses.find((c) => c.id === 'next')?.color).toBe(COURSE_COLORS[0]);
  });

  it('deleting a semester keeps its courses, unassigned', () => {
    const state = libraryReducer(withTwoSemesters(), { type: 'library/DELETE_SEMESTER', id: 's_fall' });
    expect(state.semesters.map((s) => s.id)).toEqual(['s_spring']);
    expect(state.courses.map((c) => [c.id, c.semesterId])).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['c', 's_spring'],
      ['d', undefined],
    ]);
  });
});

describe('librarySlice doc types', () => {
  it('sets the type on the listed documents and leaves the rest (and unchanged ones) as they were', () => {
    const before = run({
      type: 'library/SET_FILES',
      files: [makeDoc({ id: 'a' }), makeDoc({ id: 'b', docType: 'lab' }), makeDoc({ id: 'c' })],
    });
    const after = libraryReducer(before, { type: 'library/SET_DOC_TYPE', ids: ['a', 'b'], docType: 'lab' });
    expect(after.files.map((f) => f.docType)).toEqual(['lab', 'lab', undefined]);
    expect(after.files[1]).toBe(before.files[1]);
    expect(after.files[2]).toBe(before.files[2]);
  });
});

describe('librarySlice timetable', () => {
  it('keeps slots sorted and drops a deleted course\'s slots', () => {
    const state = run(
      createCourse('a'),
      createCourse('b'),
      { type: 'library/ADD_SLOT', slot: { id: 's1', courseId: 'a', weekday: 3, startMin: 600, endMin: 660 } },
      { type: 'library/ADD_SLOT', slot: { id: 's2', courseId: 'b', weekday: 1, startMin: 540, endMin: 600 } },
      { type: 'library/ADD_SLOT', slot: { id: 's3', courseId: 'a', weekday: 1, startMin: 480, endMin: 530 } },
      { type: 'library/UPDATE_SLOT', id: 's3', patch: { startMin: 700, endMin: 760 } }
    );
    expect(state.timetable.map((s) => s.id)).toEqual(['s2', 's3', 's1']);
    const after = libraryReducer(state, { type: 'library/DELETE_COURSE', id: 'a' });
    expect(after.timetable.map((s) => s.id)).toEqual(['s2']);
  });
});
