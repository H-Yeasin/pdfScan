import { formatDate, t } from '../../i18n';
import type { Course, LibraryDocument, Semester } from '../../types/models';

// Everything Home derives from the library, as pure functions of state + today, so the rules are
// tested without rendering (and Home re-derives them cheaply with useMemo).

// The semester "now" is in: an active one whose dates contain today (the latest-starting one if
// terms overlap); failing that, the most recent active one that has started (the gap between
// terms still belongs to the last one); failing that, the soonest upcoming one. Null with no
// active semesters. `today` is a local 'YYYY-MM-DD' day, so string comparison orders it.
export function currentSemester(semesters: readonly Semester[], today: string): Semester | null {
  const active = semesters.filter((s) => !s.archived);
  const byStartDesc = [...active].sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  const containing = byStartDesc.find((s) => s.startsOn <= today && (!s.endsOn || today <= s.endsOn));
  if (containing) return containing;
  const started = byStartDesc.find((s) => s.startsOn <= today);
  if (started) return started;
  return byStartDesc[byStartDesc.length - 1] ?? null;
}

// The semester Home shows: the one the student picked in the switcher if it's still active,
// otherwise the current one.
export function homeSemester(semesters: readonly Semester[], pickedId: string | null, today: string): Semester | null {
  const picked = pickedId ? semesters.find((s) => s.id === pickedId && !s.archived) : undefined;
  return picked ?? currentSemester(semesters, today);
}

// Courses on Home: the active courses of that semester plus active courses that aren't in any
// semester (they'd otherwise be unreachable from Home). With no semester, every active course.
// Already in sortOrder, since state.library.courses is kept sorted.
export function homeCourses(courses: readonly Course[], semester: Semester | null): Course[] {
  return courses.filter((c) => !c.archived && (!semester || !c.semesterId || c.semesterId === semester.id));
}

export type CourseActivity = { count: number; lastScanAt: number | null };

// Per course id: how many documents it has and when the newest one was saved. Documents without a
// course are counted under `unsorted`.
export function courseActivity(files: readonly LibraryDocument[]): {
  byCourse: Map<string, CourseActivity>;
  unsorted: CourseActivity;
} {
  const byCourse = new Map<string, CourseActivity>();
  const unsorted: CourseActivity = { count: 0, lastScanAt: null };
  for (const file of files) {
    const entry = file.courseId ? (byCourse.get(file.courseId) ?? { count: 0, lastScanAt: null }) : unsorted;
    entry.count++;
    if (entry.lastScanAt === null || file.createdAt > entry.lastScanAt) entry.lastScanAt = file.createdAt;
    if (file.courseId) byCourse.set(file.courseId, entry);
  }
  return { byCourse, unsorted };
}

export type LastOpened = { id: string; at: number };

// Home's "Continue" card: whichever is more recent, the last document opened in the Reader or the
// last one saved. Null for an empty library. A last-opened document that was since deleted falls
// back to the newest saved one.
export function continueDocument(
  files: readonly LibraryDocument[],
  lastOpened: LastOpened | null
): { doc: LibraryDocument; reason: 'opened' | 'saved' } | null {
  let newest: LibraryDocument | null = null;
  for (const file of files) if (!newest || file.createdAt > newest.createdAt) newest = file;
  if (!newest) return null;
  const opened = lastOpened ? files.find((f) => f.id === lastOpened.id) : undefined;
  if (opened && lastOpened && lastOpened.at >= newest.createdAt) return { doc: opened, reason: 'opened' };
  return { doc: newest, reason: 'saved' };
}

// "Today", "Yesterday", "3 days ago", then a short date. For the course cards' last scan.
export function relativeDay(at: number, now: number): string {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  if (days < 7) return t('common.daysAgo', { count: days });
  return formatDate(at, { month: 'short', day: 'numeric' });
}

// Home's "Move earlier/later": swaps a course with its neighbour among the courses Home shows,
// returning the full new id order for library/REORDER_COURSES. Courses Home doesn't show (other
// semesters, archived) keep their positions. Null at either end.
export function moveCourse(allCourses: readonly Course[], shownIds: readonly string[], id: string, step: -1 | 1): string[] | null {
  const shownIndex = shownIds.indexOf(id);
  const neighbour = shownIds[shownIndex + step];
  if (shownIndex === -1 || neighbour === undefined) return null;
  const ids = allCourses.map((c) => c.id);
  const a = ids.indexOf(id);
  const b = ids.indexOf(neighbour);
  [ids[a], ids[b]] = [ids[b], ids[a]];
  return ids;
}
