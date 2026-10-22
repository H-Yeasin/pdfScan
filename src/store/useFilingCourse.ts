import { useMemo } from 'react';
import { suggestCourses } from '../services/courses/suggestCourse';
import type { AppState } from './appReducer';
import { useAppSlices } from './AppStateContext';

// Which course the current scan session will be saved to, and the ranked alternatives (K5).
// Shared by Review, Deliver and the scanner launch (filingCourseNow), so all of them agree. A course the student
// picked (or the course page they scanned from) wins; otherwise it's the top suggestion, computed
// at the time the session started (capture.startedAt) - or now, before the first page.
export function useFilingCourse(): { courseId: string | null; suggestions: string[]; automatic: boolean } {
  const state = useAppSlices('capture', 'deliver', 'library');
  const { courses, timetable, files } = state.library;
  const { mode, startedAt } = state.capture;
  const { courseId, coursePicked } = state.deliver;

  const suggestions = useMemo(
    () => suggestCourses({ now: new Date(startedAt ?? Date.now()), mode, courses, timetable, history: files }),
    [startedAt, mode, courses, timetable, files]
  );

  if (coursePicked) return { courseId, suggestions, automatic: false };
  return { courseId: suggestions[0] ?? null, suggestions, automatic: true };
}

// The same answer read once, outside a render: for the scanner launch and the gallery import
// (§17 U5), which run from the tab bar and must not re-render it on every change.
export function filingCourseNow(state: Pick<AppState, 'capture' | 'deliver' | 'library'>): string | null {
  if (state.deliver.coursePicked) return state.deliver.courseId;
  const { courses, timetable, files } = state.library;
  const { mode, startedAt } = state.capture;
  return suggestCourses({ now: new Date(startedAt ?? Date.now()), mode, courses, timetable, history: files })[0] ?? null;
}
