import { useMemo } from 'react';
import { getCaptureModeSpec } from '../services/capture/captureModes';
import { defaultDocTypeFor, nextTypeNumber } from '../services/courses/docTypes';
import { coverDefaults, type CoverValues } from '../services/pdf/coverTemplates';
import { useAppState } from './AppStateContext';
import { useFilingCourse } from './useFilingCourse';

// What a cover page shows for the scan in Deliver before the student edits anything: the
// profile, the course it is filed under, its type and number ("Assignment 3"), today's date.
// Shared by Deliver (which draws the cover) and Academic options (which shows the fields).
export function useCoverDefaults(): CoverValues {
  const { state } = useAppState();
  const { courseId } = useFilingCourse();
  const docType = state.deliver.docType ?? defaultDocTypeFor(getCaptureModeSpec(state.capture.mode));
  const { courses, files } = state.library;
  const { profile } = state.settings;
  return useMemo(() => {
    const course = courses.find((c) => c.id === courseId);
    return coverDefaults({ profile, course, docType, n: nextTypeNumber(files, courseId ?? undefined, docType), date: new Date() });
  }, [courses, courseId, docType, files, profile]);
}
