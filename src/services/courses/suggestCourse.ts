import type { CaptureMode, Course, LibraryDocument, TimetableSlot } from '../../types/models';
import { slotsAt } from './timetable';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type FilingHistory = readonly Pick<LibraryDocument, 'courseId' | 'createdAt' | 'mode'>[];

// The courses a new scan is most likely for, best first; Deliver preselects the first and offers
// the top 3 as chips. A ranked list rather than one guess, so a wrong guess is one tap away. Only
// active courses, each once:
//  1. the course whose class (timetable) is on at `now`, with SLOT_SLACK_MIN either side;
//  2. the course last used with this capture mode (e.g. Board scans tend to be the same lecture);
//  3. the courses used in the last 7 days, most-used first (ties: most recent);
//  4. every other active course, alphabetically.
// History is the library itself (documents' course, time and mode), so there's no log to keep.
export function suggestCourses({
  now,
  mode,
  courses,
  timetable,
  history,
}: {
  now: Date;
  mode: CaptureMode;
  courses: readonly Course[];
  timetable: readonly TimetableSlot[];
  history: FilingHistory;
}): string[] {
  const active = new Set(courses.filter((c) => !c.archived).map((c) => c.id));
  const ranked: string[] = [];
  const add = (id: string | undefined) => {
    if (id && active.has(id) && !ranked.includes(id)) ranked.push(id);
  };

  for (const slot of slotsAt(timetable, now)) add(slot.courseId);

  const newestFirst = [...history].sort((a, b) => b.createdAt - a.createdAt);
  add(newestFirst.find((d) => d.mode === mode && d.courseId && active.has(d.courseId))?.courseId);

  const since = now.getTime() - WEEK_MS;
  const recent = new Map<string, { count: number; last: number }>();
  for (const doc of newestFirst) {
    if (!doc.courseId || doc.createdAt < since || doc.createdAt > now.getTime()) continue;
    const entry = recent.get(doc.courseId) ?? { count: 0, last: doc.createdAt };
    entry.count++;
    recent.set(doc.courseId, entry);
  }
  [...recent.entries()].sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last).forEach(([id]) => add(id));

  courses
    .filter((c) => !c.archived)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c) => add(c.id));

  return ranked;
}
