import { resolveOcrScript } from '../services/scripts/registry';
import type { OcrScript } from '../types/models';
import { useAppState } from './AppStateContext';
import { useFilingCourse } from './useFilingCourse';

// The script the current scan session's pages are recognised with (§6 L1): the filing course's
// own choice, else the app setting. Same course as Capture's "Saving to" chip and Deliver, so a
// page is OCR'd at ingest, re-OCR'd in Review and finalised in Deliver with one model.
export function useScanOcrScript(): OcrScript {
  const { state } = useAppState();
  const { courseId } = useFilingCourse();
  const course = state.library.courses.find((c) => c.id === courseId);
  return resolveOcrScript({ course, settings: state.settings });
}
