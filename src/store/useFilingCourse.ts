import { useMemo } from 'react';
import { suggestCourses } from '../services/courses/suggestCourse';
import { useAppState } from './AppStateContext';

// Which course the current scan session will be saved to, and the ranked alternatives (K5).
// Shared by Capture's "Saving to" chip and Deliver, so both always agree. A course the student
// picked (or the course page they scanned from) wins; otherwise it's the top suggestion, computed
// at the time the session started (capture.startedAt) - or now, before the first page.
export function useFilingCourse(): { courseId: string | null; suggestions: string[]; automatic: boolean } {
  const { state } = useAppState();
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
