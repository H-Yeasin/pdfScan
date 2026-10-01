import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { docTypeOf } from '../courses/docTypes';
import type { Deadline, DocType, LibraryDocument } from '../../types/models';

// §4 S8: local reminders only (no push token, no network).

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Before the due time: a day ahead (time to scan) and two hours ahead (time to submit).
export const REMINDER_OFFSETS_MS = [24 * HOUR, 2 * HOUR] as const;

export const DEADLINE_CHANNEL_ID = 'deadlines';

// What a reminder carries, so tapping it can open the course with the deadline highlighted.
export type DeadlineNotificationData = { deadlineId: string; courseId: string };

// When the reminders for `dueAt` go off, earliest first; times already past are skipped.
export function reminderTimes(dueAt: number, now: number): number[] {
  return REMINDER_OFFSETS_MS.map((offset) => dueAt - offset).filter((at) => at > now);
}

// "Tue 10:00", or "today 10:00" / "tomorrow 10:00": how a due time reads in a reminder and a list.
export function formatDue(dueAt: number, now: number): string {
  const due = new Date(dueAt);
  const time = due.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (t: number) => new Date(new Date(t).toDateString()).getTime();
  const days = Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days === -1) return `yesterday ${time}`;
  const date =
    Math.abs(days) < 7
      ? due.toLocaleDateString(undefined, { weekday: 'short' })
      : due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${date} ${time}`;
}

let channelReady: Promise<unknown> | null = null;
function ensureChannel(): Promise<unknown> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(DEADLINE_CHANNEL_ID, {
    name: 'Deadlines',
    importance: Notifications.AndroidImportance.HIGH,
  });
  return channelReady;
}

// Asks for notification permission the first time it's needed (the first deadline), never at
// app start. False when the student said no; deadlines are still saved, just without reminders.
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function cancelReminders(deadline: Pick<Deadline, 'reminderIds'>): Promise<void> {
  for (const id of deadline.reminderIds) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

// Schedules a deadline's reminders, replacing any it had (an edit moves them), and returns the
// new ids to store. A done deadline gets none.
export async function scheduleReminders(
  deadline: Pick<Deadline, 'id' | 'courseId' | 'title' | 'dueAt' | 'reminderIds' | 'doneSubmissionId'>,
  courseLabel: string,
  now = Date.now()
): Promise<string[]> {
  await cancelReminders(deadline);
  if (deadline.doneSubmissionId) return [];
  await ensureChannel();
  const data: DeadlineNotificationData = { deadlineId: deadline.id, courseId: deadline.courseId };
  const ids: string[] = [];
  for (const at of reminderTimes(deadline.dueAt, now)) {
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${deadline.title} is due ${formatDue(deadline.dueAt, at)}`,
          body: `${courseLabel} · tap to scan it now`,
          data,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: DEADLINE_CHANNEL_ID },
      })
    );
  }
  return ids;
}

// Cancels every scheduled deadline reminder whose deadline is gone or done: a deleted deadline,
// one deleted with its course, one marked done. Run whenever the deadlines change.
export async function cancelStaleReminders(deadlines: readonly Deadline[]): Promise<number> {
  const open = new Set(deadlines.filter((d) => !d.doneSubmissionId).map((d) => d.id));
  let cancelled = 0;
  for (const request of await Notifications.getAllScheduledNotificationsAsync()) {
    const deadlineId = (request.content.data as Partial<DeadlineNotificationData> | undefined)?.deadlineId;
    if (typeof deadlineId === 'string' && !open.has(deadlineId)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
      cancelled += 1;
    }
  }
  return cancelled;
}

// The open deadline a submission settles: same course, same type if the deadline has one, and
// due after the document was made (an older deadline was for older work). The soonest if several.
export function matchDeadline(
  doc: Pick<LibraryDocument, 'courseId' | 'docType' | 'createdAt'>,
  deadlines: readonly Deadline[]
): Deadline | undefined {
  if (!doc.courseId) return undefined;
  const type: DocType = docTypeOf(doc);
  return deadlines
    .filter((d) => !d.doneSubmissionId && d.courseId === doc.courseId && (!d.docType || d.docType === type) && d.dueAt > doc.createdAt)
    .sort((a, b) => a.dueAt - b.dueAt)[0];
}

// Home's "Due soon": open deadlines due within `days` (overdue ones included), soonest first.
export function dueSoon(deadlines: readonly Deadline[], now: number, days = 7): Deadline[] {
  return deadlines.filter((d) => !d.doneSubmissionId && d.dueAt <= now + days * DAY).sort((a, b) => a.dueAt - b.dueAt);
}

// "10:00", "9:5", "23:59" → minutes after midnight; anything else → null.
export function parseTime(text: string): number | null {
  const match = /^\s*(\d{1,2})\s*[:.]\s*(\d{1,2})\s*$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Local midnight of the day `at` falls on.
export function startOfDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// A local date plus a time of day. Built from the date's fields (not by adding milliseconds), so
// a daylight-saving change in between doesn't shift it by an hour.
export function dueAtFrom(dayStart: number, minutes: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(minutes / 60), minutes % 60).getTime();
}

// The days the editor offers: today and the next 13, as local midnights.
export function upcomingDays(now: number, count = 14): number[] {
  const today = new Date(startOfDay(now));
  return Array.from({ length: count }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i).getTime());
}
