import * as Notifications from 'expo-notifications';
import type { Deadline } from '../../../types/models';
import {
  cancelStaleReminders,
  dueSoon,
  ensureNotificationPermission,
  matchDeadline,
  reminderTimes,
  scheduleReminders,
} from '../deadlines';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mock = Notifications as any;

const HOUR = 3_600_000;
const today9 = new Date(2026, 9, 2, 9, 0).getTime();
const tomorrow10 = new Date(2026, 9, 3, 10, 0).getTime();

function deadline(overrides: Partial<Deadline> = {}): Deadline {
  return { id: 'd1', courseId: 'cse', title: 'HW3', dueAt: tomorrow10, reminderIds: [], createdAt: 0, ...overrides };
}

beforeEach(() => mock.__reset());

describe('reminderTimes', () => {
  it('a deadline tomorrow 10:00 reminds at 10:00 today and 08:00 tomorrow', () => {
    expect(reminderTimes(tomorrow10, today9)).toEqual([new Date(2026, 9, 2, 10, 0).getTime(), new Date(2026, 9, 3, 8, 0).getTime()]);
  });

  it('skips times already past', () => {
    expect(reminderTimes(tomorrow10, tomorrow10 - 3 * HOUR)).toEqual([tomorrow10 - 2 * HOUR]);
    expect(reminderTimes(tomorrow10, tomorrow10 - HOUR)).toEqual([]);
  });
});

describe('scheduling', () => {
  it('schedules both reminders with what a tap needs', async () => {
    const ids = await scheduleReminders(deadline(), 'CSE 101', today9);
    expect(ids).toHaveLength(2);
    const scheduled = mock.__scheduled();
    expect(scheduled.map((r: { trigger: { date: number } }) => r.trigger.date)).toEqual(reminderTimes(tomorrow10, today9));
    expect(scheduled[0].content).toMatchObject({ data: { deadlineId: 'd1', courseId: 'cse' } });
    expect(scheduled[0].content.title).toMatch(/^HW3 is due tomorrow/);
  });

  it('an edit cancels the old reminders and schedules new ones', async () => {
    const first = await scheduleReminders(deadline(), 'CSE 101', today9);
    const second = await scheduleReminders(deadline({ reminderIds: first, dueAt: tomorrow10 + 4 * HOUR }), 'CSE 101', today9);
    expect(mock.__scheduled().map((r: { identifier: string }) => r.identifier)).toEqual(second);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });

  it('a done deadline gets no reminders', async () => {
    const ids = await scheduleReminders(deadline({ doneSubmissionId: 's1' }), 'CSE 101', today9);
    expect(ids).toEqual([]);
    expect(mock.__scheduled()).toEqual([]);
  });

  it("cancels reminders of deadlines that are gone or done, and keeps the rest", async () => {
    await scheduleReminders(deadline({ id: 'gone' }), 'X', today9);
    await scheduleReminders(deadline({ id: 'done' }), 'X', today9);
    const kept = await scheduleReminders(deadline({ id: 'open' }), 'X', today9);
    const cancelled = await cancelStaleReminders([deadline({ id: 'done', doneSubmissionId: 's' }), deadline({ id: 'open' })]);
    expect(cancelled).toBe(4);
    expect(mock.__scheduled().map((r: { identifier: string }) => r.identifier)).toEqual(kept);
  });
});

describe('permission', () => {
  it('asks once, when needed', async () => {
    expect(await ensureNotificationPermission()).toBe(true);
    mock.__reset({ grantOnRequest: false });
    expect(await ensureNotificationPermission()).toBe(false);
    // Denied: not asked again.
    expect(await ensureNotificationPermission()).toBe(false);
  });
});

describe('matchDeadline', () => {
  const doc = { courseId: 'cse', docType: 'assignment' as const, createdAt: today9 };

  it('finds the open deadline of the same course and type, due after the document was made', () => {
    const lab = deadline({ id: 'lab', docType: 'lab' });
    const hw = deadline({ id: 'hw', docType: 'assignment' });
    const any = deadline({ id: 'any', dueAt: tomorrow10 + DAY() });
    expect(matchDeadline(doc, [any, lab, hw])?.id).toBe('hw');
    expect(matchDeadline({ ...doc, docType: 'notes' }, [lab, any])?.id).toBe('any');
  });

  it('ignores done, past and other-course deadlines, and Unsorted documents', () => {
    expect(matchDeadline(doc, [deadline({ doneSubmissionId: 's' })])).toBeUndefined();
    expect(matchDeadline(doc, [deadline({ dueAt: today9 - HOUR })])).toBeUndefined();
    expect(matchDeadline(doc, [deadline({ courseId: 'phy' })])).toBeUndefined();
    expect(matchDeadline({ ...doc, courseId: undefined }, [deadline()])).toBeUndefined();
  });
});

describe('dueSoon', () => {
  it('lists open deadlines in the next 7 days, overdue ones included, soonest first', () => {
    const list = dueSoon(
      [
        deadline({ id: 'later', dueAt: today9 + 8 * DAY() }),
        deadline({ id: 'soon', dueAt: today9 + DAY() }),
        deadline({ id: 'overdue', dueAt: today9 - DAY() }),
        deadline({ id: 'done', dueAt: today9 + HOUR, doneSubmissionId: 's' }),
      ],
      today9
    );
    expect(list.map((d) => d.id)).toEqual(['overdue', 'soon']);
  });
});

function DAY() {
  return 24 * HOUR;
}

describe('editor helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseTime, formatTime, dueAtFrom, upcomingDays, startOfDay } = require('../deadlines');

  it('parses and formats times', () => {
    expect(parseTime('10:00')).toBe(600);
    expect(parseTime(' 9.5 ')).toBe(545);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('noon')).toBeNull();
    expect(formatTime(545)).toBe('09:05');
  });

  it('builds the due time from a day and a time', () => {
    expect(dueAtFrom(startOfDay(tomorrow10), 600)).toBe(tomorrow10);
    const days = upcomingDays(today9, 3);
    expect(days).toHaveLength(3);
    expect(new Date(days[1]).getDate()).toBe(3);
  });
});
