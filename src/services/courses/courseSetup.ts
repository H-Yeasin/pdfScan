import type { LibraryAction } from '../../store/slices/librarySlice';
import type { Course, CourseColor, Semester } from '../../types/models';
import { toLocalDateString } from '../../utils/localDate';
import { nextCourseColor } from './palette';

// Course setup rules shared by CourseEditorSheet (one course) and QuickSetupSheet (several at
// once, also reused by §9 onboarding). Pure, so the rules are tested without any UI.

// Subject emojis for the editor's picker. A short fixed list on purpose: no emoji keyboard or
// extra package, and every one renders on stock Android.
export const COURSE_EMOJIS: readonly string[] = [
  '📐', '➗', '📊', '🧮', '🔬', '🧪', '🧬', '⚛️',
  '🌍', '🗺️', '🏛️', '📜', '📖', '✍️', '🗣️', '🎭',
  '🎨', '🎵', '💻', '🤖', '⚙️', '💼', '⚖️', '🩺',
];

// A term named the way students say it, from the date it's set up on: January-May is Spring,
// June-July Summer, August-December Fall. Dates are the term's whole span (local days), so K5 can
// find the current semester by date; the student can change both.
export function defaultSemester(now: Date): { name: string; startsOn: string; endsOn: string } {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const span = (from: number, toMonth: number, toDay: number) => ({
    startsOn: toLocalDateString(new Date(year, from, 1).getTime()),
    endsOn: toLocalDateString(new Date(year, toMonth, toDay).getTime()),
  });
  if (month <= 4) return { name: `Spring ${year}`, ...span(0, 4, 31) };
  if (month <= 6) return { name: `Summer ${year}`, ...span(5, 6, 31) };
  return { name: `Fall ${year}`, ...span(7, 11, 31) };
}

// Codes compare loosely: "cse 101", "CSE101" and " CSE  101 " are the same course code.
function codeKey(code: string | undefined): string {
  return (code ?? '').replace(/\s+/g, '').toLowerCase();
}

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findSemesterByName(semesters: readonly Semester[], name: string): Semester | undefined {
  const key = nameKey(name);
  return semesters.find((s) => !s.archived && nameKey(s.name) === key);
}

export type CourseDraft = { name: string; code?: string; semesterId?: string };
export type CourseDraftErrors = { name?: string; code?: string };

// One course from the editor. A code must be unique among the active courses of the same semester
// (two "MATH 101"s in one term is always a typo); the same code in another term is a retake.
// `selfId` is the course being edited, so it doesn't clash with itself.
export function validateCourseDraft(draft: CourseDraft, courses: readonly Course[], selfId?: string): CourseDraftErrors {
  const errors: CourseDraftErrors = {};
  if (!draft.name.trim()) errors.name = 'Give the course a name';
  const code = codeKey(draft.code);
  if (code) {
    const clash = courses.find(
      (c) => c.id !== selfId && !c.archived && c.semesterId === draft.semesterId && codeKey(c.code) === code
    );
    if (clash) errors.code = `${clash.name} already uses this code`;
  }
  return errors;
}

export function hasErrors(errors: CourseDraftErrors): boolean {
  return !!(errors.name || errors.code);
}

export type QuickSetupRow = { name: string; code: string };

// Rows of the "Add your courses" sheet. Completely blank rows are ignored (the sheet starts with
// a few empty ones); a code without a name is an error. Codes must be unique among the rows and
// against the active courses already in that semester. Returns one entry per row, by index.
export function validateQuickSetup(
  rows: readonly QuickSetupRow[],
  semesterName: string,
  courses: readonly Course[],
  semesters: readonly Semester[]
): { rowErrors: CourseDraftErrors[]; semesterError?: string; count: number } {
  const semesterId = findSemesterByName(semesters, semesterName)?.id;
  const seenCodes = new Map<string, number>();
  let count = 0;
  const rowErrors = rows.map((row, index): CourseDraftErrors => {
    if (!row.name.trim() && !row.code.trim()) return {};
    count++;
    const errors = validateCourseDraft({ name: row.name, code: row.code, semesterId }, courses);
    const code = codeKey(row.code);
    if (code && !errors.code) {
      const earlier = seenCodes.get(code);
      if (earlier !== undefined) errors.code = `Same code as row ${earlier + 1}`;
      else seenCodes.set(code, index);
    }
    return errors;
  });
  return { rowErrors, semesterError: semesterName.trim() ? undefined : 'Name the semester', count };
}

// The colours the next `n` new courses will get, in order - what the sheet shows next to each row
// before saving, and what it saves, so the preview always matches.
export function upcomingColors(courses: readonly Course[], n: number): CourseColor[] {
  const pool: Pick<Course, 'color' | 'archived'>[] = [...courses];
  const result: CourseColor[] = [];
  for (let i = 0; i < n; i++) {
    const color = nextCourseColor(pool);
    result.push(color);
    pool.push({ color, archived: false });
  }
  return result;
}

// The actions that save a valid quick setup: the semester (reused if one with that name is
// active, so running setup again for the same term adds to it), then one course per non-blank
// row, coloured as previewed. Call only after validateQuickSetup found no errors.
export function quickSetupActions(
  rows: readonly QuickSetupRow[],
  semesterName: string,
  courses: readonly Course[],
  semesters: readonly Semester[],
  now: Date,
  makeId: (prefix: string) => string
): LibraryAction[] {
  const actions: LibraryAction[] = [];
  let semesterId = findSemesterByName(semesters, semesterName)?.id;
  if (!semesterId) {
    semesterId = makeId('semester');
    const { startsOn, endsOn } = defaultSemester(now);
    actions.push({
      type: 'library/CREATE_SEMESTER',
      semester: { id: semesterId, name: semesterName.trim().replace(/\s+/g, ' '), startsOn, endsOn },
    });
  }
  const filled = rows.filter((row) => row.name.trim());
  const colors = upcomingColors(courses, filled.length);
  filled.forEach((row, i) => {
    const code = row.code.trim().replace(/\s+/g, ' ');
    actions.push({
      type: 'library/CREATE_COURSE',
      id: makeId('course'),
      name: row.name.trim().replace(/\s+/g, ' '),
      fields: { code: code || undefined, color: colors[i], semesterId },
    });
  });
  return actions;
}
