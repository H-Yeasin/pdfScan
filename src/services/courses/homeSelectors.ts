import { formatDate, t } from '../../i18n';
import type { Course, LibraryDocument, Semester, StudentProfile } from '../../types/models';

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

// How many documents settings.recentOpened keeps; Home shows the newest that still exists.
export const RECENT_OPENED_MAX = 10;

// settings/SET_LAST_OPENED: the document goes to the front, once; the list stops at
// RECENT_OPENED_MAX. A document deleted since is dropped when Home reads the list.
export function pushRecentOpened(list: readonly LastOpened[], opened: LastOpened): LastOpened[] {
  return [opened, ...list.filter((entry) => entry.id !== opened.id)].slice(0, RECENT_OPENED_MAX);
}

// The stored list as it is read back: entries of the right shape, one per document, newest first.
export function normalizeRecentOpened(raw: unknown): LastOpened[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LastOpened[] = [];
  for (const entry of raw as unknown[]) {
    const e = entry as Partial<LastOpened> | null;
    if (!e || typeof e.id !== 'string' || typeof e.at !== 'number' || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, at: e.at });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, RECENT_OPENED_MAX);
}

// §17 U6, Home's "Continue reading": the document last opened in the Reader that still exists and
// isn't archived, or null. Only an opened one: the newest saved scan used to stand in here, but it
// is always Recent files' first row too, so Home showed the same document twice.
export function continueDocument(files: readonly LibraryDocument[], recent: readonly LastOpened[]): LibraryDocument | null {
  const byId = new Map(files.map((f) => [f.id, f]));
  for (const { id } of recent) {
    const doc = byId.get(id);
    if (doc && !doc.archived) return doc;
  }
  return null;
}

// "Page 12 of 40" on a Continue card: the library page reading stopped on (1-based) and the page
// count, for the formats read on the page surface. The saved position finds its page by id;
// `lastPage` (a PDF page) stands in only for a standard layout, where PDF and library pages are
// the same. Null when the document was never read, or isn't read by pages (TXT, sheets, DOCX).
export function continueProgress(doc: Pick<LibraryDocument, 'format' | 'pages' | 'lastPosition' | 'lastPage' | 'pdfLayout'>): { page: number; count: number } | null {
  const count = doc.pages.length;
  if ((doc.format !== 'PDF' && doc.format !== 'JPG') || count === 0) return null;
  const position = doc.lastPosition;
  let index: number | undefined;
  if (position?.kind === 'page') {
    const byId = position.pageId ? doc.pages.findIndex((p) => p.id === position.pageId) : -1;
    index = byId >= 0 ? byId : position.index;
  } else if (doc.lastPage !== undefined && doc.pdfLayout !== '2_in_1') {
    index = doc.lastPage - 1;
  }
  if (index === undefined) return null;
  return { page: Math.min(Math.max(Math.floor(index), 0), count - 1) + 1, count };
}

// Home's "Recent files": the newest saved documents, archived ones left out, and the one Continue
// already shows (`exceptId`) so no document is on Home twice. Three: the list sits under the
// courses and the banner, and "See all" opens Files for the rest.
export function recentFiles(files: readonly LibraryDocument[], max = 3, exceptId?: string): LibraryDocument[] {
  return files
    .filter((f) => !f.archived && f.id !== exceptId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, max);
}

// The greeting's name: the first word of the profile's name ("Rahim" of "Rahim Uddin"), or null
// without one (Home then says "Hi there").
export function greetingName(profile: Pick<StudentProfile, 'name'>): string | null {
  const first = profile.name.trim().split(/\s+/)[0];
  return first ? first : null;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(hour: number): DayPart {
  if (hour < 5 || hour >= 17) return 'evening';
  return hour < 12 ? 'morning' : 'afternoon';
}

// Whole minutes left on a Pro pass, rounded up (a pass with 30 s left still says "1 min").
export function passMinutesLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 60_000));
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
