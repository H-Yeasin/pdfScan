import type { Course, TimetableSlot } from '../../../types/models';
import { suggestCourses, type FilingHistory } from '../suggestCourse';
import { formatSlot, parseSlotTimes, parseTime, slotChanges, slotsAt } from '../timetable';

const course = (id: string, name: string, archived = false): Course => ({
  id,
  name,
  color: 'teal',
  archived,
  sortOrder: 0,
  createdAt: 0,
});

const courses = [course('cs', 'CSE 101'), course('ma', 'Calculus'), course('ph', 'Physics'), course('ch', 'Chemistry')];

// Wednesday 2026-09-30, 10:00 local.
const wed10 = new Date(2026, 8, 30, 10, 0);
const DAY = 24 * 60 * 60 * 1000;
const slot = (courseId: string, weekday: number, start: string, end: string): TimetableSlot => ({
  id: `${courseId}-${weekday}-${start}`,
  courseId,
  weekday,
  startMin: parseTime(start)!,
  endMin: parseTime(end)!,
});

const at = (d: Date, h: number, m: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

describe('suggestCourses', () => {
  const suggest = (opts: { now?: Date; mode?: 'doc' | 'board'; timetable?: TimetableSlot[]; history?: FilingHistory; list?: Course[] }) =>
    suggestCourses({
      now: opts.now ?? wed10,
      mode: opts.mode ?? 'doc',
      courses: opts.list ?? courses,
      timetable: opts.timetable ?? [],
      history: opts.history ?? [],
    });

  it('with no history or timetable, lists active courses alphabetically', () => {
    expect(suggest({})).toEqual(['ma', 'ch', 'cs', 'ph']);
  });

  it('puts the class that is on now first', () => {
    const timetable = [slot('ph', 3, '9:30', '11:00'), slot('cs', 3, '13:00', '14:00')];
    expect(suggest({ timetable, history: [{ courseId: 'ma', createdAt: wed10.getTime() - 1000, mode: 'doc' }] })[0]).toBe('ph');
  });

  it('gives 15 minutes of slack either side of a slot, and no more', () => {
    const timetable = [slot('ph', 3, '10:15', '11:00')];
    expect(suggest({ timetable, now: at(wed10, 10, 0) })[0]).toBe('ph');
    expect(suggest({ timetable, now: at(wed10, 9, 59) })[0]).not.toBe('ph');
    expect(suggest({ timetable, now: at(wed10, 11, 15) })[0]).toBe('ph');
    expect(suggest({ timetable, now: at(wed10, 11, 16) })[0]).not.toBe('ph');
  });

  it('ignores other weekdays, and prefers the slot actually in progress over one in its slack', () => {
    expect(suggest({ timetable: [slot('ph', 4, '9:00', '11:00')] })[0]).toBe('ma');
    const back2back = [slot('ma', 3, '9:00', '9:50'), slot('ph', 3, '10:00', '11:00')];
    expect(suggest({ timetable: back2back, now: at(wed10, 10, 5) }).slice(0, 2)).toEqual(['ph', 'ma']);
  });

  it('then the last course used with this capture mode', () => {
    const history: FilingHistory = [
      { courseId: 'cs', createdAt: wed10.getTime() - 3 * DAY, mode: 'board' },
      { courseId: 'ch', createdAt: wed10.getTime() - 2 * DAY, mode: 'doc' },
      { courseId: 'ph', createdAt: wed10.getTime() - 1 * DAY, mode: 'doc' },
    ];
    expect(suggest({ mode: 'board', history })[0]).toBe('cs');
    expect(suggest({ mode: 'doc', history })[0]).toBe('ph');
  });

  it('then the most-used courses of the last 7 days', () => {
    const history: FilingHistory = [
      { courseId: 'ch', createdAt: wed10.getTime() - 1 * DAY, mode: 'doc' },
      { courseId: 'ma', createdAt: wed10.getTime() - 2 * DAY, mode: 'doc' },
      { courseId: 'ma', createdAt: wed10.getTime() - 3 * DAY, mode: 'doc' },
      { courseId: 'cs', createdAt: wed10.getTime() - 10 * DAY, mode: 'doc' },
      { courseId: 'cs', createdAt: wed10.getTime() - 11 * DAY, mode: 'doc' },
      { courseId: 'cs', createdAt: wed10.getTime() - 12 * DAY, mode: 'doc' },
    ];
    // ch: last with this mode; ma: most used this week; then the rest alphabetically (cs is too old).
    expect(suggest({ history })).toEqual(['ch', 'ma', 'cs', 'ph']);
  });

  it('never suggests archived courses, even from the timetable or history', () => {
    const list = [...courses.filter((c) => c.id !== 'ph'), course('ph', 'Physics', true)];
    const result = suggest({
      list,
      timetable: [slot('ph', 3, '9:00', '11:00')],
      history: [{ courseId: 'ph', createdAt: wed10.getTime() - DAY, mode: 'doc' }],
    });
    expect(result).not.toContain('ph');
    expect(result).toEqual(['ma', 'ch', 'cs']);
  });

  it('ignores unsorted documents and returns nothing without courses', () => {
    expect(suggest({ history: [{ courseId: undefined, createdAt: wed10.getTime(), mode: 'doc' }] })[0]).toBe('ma');
    expect(suggest({ list: [] })).toEqual([]);
  });
});

describe('timetable helpers', () => {
  it.each([
    ['9', 540],
    ['9:30', 570],
    ['930', 570],
    ['0930', 570],
    ['14:05', 845],
    ['2pm', 840],
    ['2:15 PM', 855],
    ['12am', 0],
    ['12pm', 720],
  ])('parses %s', (input, minutes) => {
    expect(parseTime(input)).toBe(minutes);
  });

  it.each(['', '25:00', '9:60', '13pm', 'noon', '9.30'])('rejects %s', (input) => {
    expect(parseTime(input)).toBeNull();
  });

  it('formats a slot and finds slots at a time', () => {
    const s = slot('cs', 3, '9:00', '10:30');
    expect(formatSlot(s)).toBe('Wed 9:00–10:30');
    expect(slotsAt([s], wed10)).toEqual([s]);
  });
});

describe('timetable editing', () => {
  it('checks typed times', () => {
    expect(parseSlotTimes('9', '10:30')).toEqual({ startMin: 540, endMin: 630 });
    expect(parseSlotTimes('nine', '10')).toHaveProperty('error');
    expect(parseSlotTimes('9', 'x')).toHaveProperty('error');
    expect(parseSlotTimes('11', '10')).toHaveProperty('error');
  });

  it('turns an edited draft into adds, updates and removals', () => {
    const a = slot('cs', 1, '9', '10');
    const b = slot('cs', 3, '9', '10');
    const c = slot('cs', 5, '9', '10');
    const movedB = { ...b, startMin: 600, endMin: 660 };
    const d = slot('cs', 2, '13', '14');
    expect(slotChanges([a, b, c], [a, movedB, d])).toEqual({ added: [d], updated: [movedB], removedIds: [c.id] });
  });
});
