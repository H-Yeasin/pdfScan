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
