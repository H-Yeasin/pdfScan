import type { TimetableSlot } from '../../../types/models';
import { nextClass, nextClassLabel } from '../timetable';

// §17 U6: a course card's next class.
const slot = (id: string, weekday: number, startMin: number, endMin: number, courseId = 'phy'): TimetableSlot => ({ id, courseId, weekday, startMin, endMin });

// Wednesday 7 October 2026, 10:00.
const wed10 = new Date(2026, 9, 7, 10, 0);

describe('nextClass', () => {
  it('is null without slots for the course', () => {
    expect(nextClass([slot('a', 3, 600, 660, 'chem')], 'phy', wed10)).toBeNull();
  });

  it('is on now inside a slot', () => {
    expect(nextClass([slot('a', 3, 570, 630)], 'phy', wed10)).toMatchObject({ inDays: 0, now: true });
  });

  it('takes a later slot today, else the next day that has one', () => {
    expect(nextClass([slot('a', 3, 840, 900), slot('b', 4, 540, 600)], 'phy', wed10)).toMatchObject({ slot: { id: 'a' }, inDays: 0, now: false });
    expect(nextClass([slot('a', 3, 480, 540), slot('b', 5, 540, 600)], 'phy', wed10)).toMatchObject({ slot: { id: 'b' }, inDays: 2 });
  });

  it('wraps to next week for a class that already ended today', () => {
    expect(nextClass([slot('a', 3, 480, 540)], 'phy', wed10)).toMatchObject({ slot: { id: 'a' }, inDays: 7 });
  });
});

describe('nextClassLabel', () => {
  it('says now, today, tomorrow or the weekday', () => {
    expect(nextClassLabel({ slot: slot('a', 3, 570, 630), inDays: 0, now: true })).toBe('In class now');
    expect(nextClassLabel({ slot: slot('a', 3, 840, 900), inDays: 0, now: false })).toBe('Today 14:00');
    expect(nextClassLabel({ slot: slot('a', 4, 570, 630), inDays: 1, now: false })).toBe('Tomorrow 9:30');
    expect(nextClassLabel({ slot: slot('a', 1, 570, 630), inDays: 5, now: false })).toBe('Mon 9:30');
  });
});
