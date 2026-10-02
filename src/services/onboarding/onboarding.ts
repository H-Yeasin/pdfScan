import { renderTemplate, DEFAULT_NAME_TEMPLATE } from '../submit/naming';
import type { StudentProfile } from '../../types/models';

// §9 O2: who sees the introduction, and the file-name example on its "About you" page.

// 'show': a brand-new user. 'markDone': someone who already has a library (an update from before
// onboarding existed) - they never see it, and it's recorded so. 'none': already done, or the
// library didn't load (a read error must never look like an empty library).
export function onboardingDecision(input: {
  onboardingDone: boolean;
  libraryLoaded: boolean;
  documentCount: number;
  courseCount: number;
}): 'show' | 'markDone' | 'none' {
  if (input.onboardingDone || !input.libraryLoaded) return 'none';
  return input.documentCount > 0 || input.courseCount > 0 ? 'markDone' : 'show';
}

// Where "Start" (or Skip) goes: Home once there's a course, else Capture.
export function afterOnboarding(hasActiveCourse: boolean): 'home' | 'capture' {
  return hasActiveCourse ? 'home' : 'capture';
}

// "2021331045_Rahim_CSE101_HW1.pdf": the default naming template with what the student typed,
// sample values where they haven't, so the point of asking is obvious from the first letter.
export function exampleFileName(profile: Pick<StudentProfile, 'name' | 'roll'>, sample: { name: string; roll: string }): string {
  const name = profile.name.trim() || sample.name;
  const roll = profile.roll.trim() || sample.roll;
  const file = renderTemplate(DEFAULT_NAME_TEMPLATE, {
    profile: { name, roll, section: '', institution: '' },
    course: { name: 'CSE 101', code: 'CSE101' },
    docType: 'assignment',
    n: 1,
    date: new Date(),
  });
  return `${file}.pdf`;
}

// The student card on onboarding's "About you" and "Your courses" pages: it fills in as the
// student types, so setting up feels like making something of their own rather than a form. The
// semester comes pre-filled, so the card starts a quarter done - a head start makes finishing
// more likely (the endowed-progress effect).
export type StudentCardStep = 'semester' | 'name' | 'roll' | 'courses';

export type StudentCard = {
  initials: string;
  name: string;
  roll: string;
  semester: string;
  // Labels to show as chips: the code when there is one, else the name.
  courses: { label: string; color: string }[];
  steps: Record<StudentCardStep, boolean>;
  done: number;
  total: number;
};

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function studentCard(input: {
  profile: Pick<StudentProfile, 'name' | 'roll'>;
  semester: string;
  // Course rows as typed (blank rows are skipped) and the colour each will get.
  rows: readonly { name: string; code: string }[];
  rowColors: readonly string[];
}): StudentCard {
  const name = input.profile.name.trim();
  const roll = input.profile.roll.trim();
  const semester = input.semester.trim();
  const courses = input.rows
    .map((row, i) => ({ label: row.code.trim() || row.name.trim(), color: input.rowColors[i] }))
    .filter((c) => c.label);
  const steps = { semester: !!semester, name: !!name, roll: !!roll, courses: courses.length > 0 };
  return {
    initials: initialsOf(name),
    name,
    roll,
    semester,
    courses,
    steps,
    done: Object.values(steps).filter(Boolean).length,
    total: Object.keys(steps).length,
  };
}
