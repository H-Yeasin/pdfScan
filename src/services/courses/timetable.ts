import type { TimetableSlot } from '../../types/models';
import { formatDate, t } from '../../i18n';

// Weekly class times. Minutes since local midnight; weekday 0 = Sunday (Date.getDay()).

// A weekday's short name ("Mon") in the UI language; 0 = Sunday. 7 January 2024 was a Sunday.
export function weekdayName(day: number): string {
  return formatDate(new Date(2024, 0, 7 + day), { weekday: 'short' });
}
// Display order for the editor: the school week first.
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

// How early or late a scan still counts as "in class": catching the handout before the bell or the
// board after it.
export const SLOT_SLACK_MIN = 15;

// Typed times, the way students write them: "9", "9:30", "930", "0930", "14:05", "2pm", "2:15 PM",
// "12am". Null if it isn't a time.
export function parseTime(input: string): number | null {
  const match = /^\s*(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?\s*$/i.exec(input);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase().charAt(0);
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatSlot(slot: Pick<TimetableSlot, 'weekday' | 'startMin' | 'endMin'>): string {
  return `${weekdayName(slot.weekday)} ${formatTime(slot.startMin)}–${formatTime(slot.endMin)}`;
}

// The slots `at` falls in, nearest first: 0 inside the slot, else minutes outside it, up to
// SLOT_SLACK_MIN. Slots don't wrap past midnight.
export function slotsAt(slots: readonly TimetableSlot[], at: Date): TimetableSlot[] {
  const weekday = at.getDay();
  const minute = at.getHours() * 60 + at.getMinutes();
  const distance = (s: TimetableSlot) => (minute < s.startMin ? s.startMin - minute : minute > s.endMin ? minute - s.endMin : 0);
  return slots
    .filter((s) => s.weekday === weekday && distance(s) <= SLOT_SLACK_MIN)
    .sort((a, b) => distance(a) - distance(b) || a.startMin - b.startMin);
}

// The editor's typed start/end, checked: both must be times and the class must end after it starts
// (slots don't run past midnight).
export function parseSlotTimes(start: string, end: string): { startMin: number; endMin: number } | { error: string } {
  const startMin = parseTime(start);
  const endMin = parseTime(end);
  if (startMin === null) return { error: t('courses.errors.startTime') };
  if (endMin === null) return { error: t('courses.errors.endTime') };
  if (endMin <= startMin) return { error: t('courses.errors.endBeforeStart') };
  return { startMin, endMin };
}

// Applies an edited copy of some courses' slots to the full timetable as reducer actions: what
// changed in `draft` versus `original` (both scoped to the same courses).
export function slotChanges(original: readonly TimetableSlot[], draft: readonly TimetableSlot[]) {
  const before = new Map(original.map((s) => [s.id, s]));
  const after = new Set(draft.map((s) => s.id));
  return {
    added: draft.filter((s) => !before.has(s.id)),
    updated: draft.filter((s) => {
      const old = before.get(s.id);
      return !!old && (old.courseId !== s.courseId || old.weekday !== s.weekday || old.startMin !== s.startMin || old.endMin !== s.endMin);
    }),
    removedIds: original.filter((s) => !after.has(s.id)).map((s) => s.id),
  };
}
