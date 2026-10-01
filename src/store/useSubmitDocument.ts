import { useCallback } from 'react';
import { canSubmit } from '../services/documents/formatCapabilities';
import { typeNumberOf } from '../services/courses/docTypes';
import { shareAs } from '../services/sharing/shareService';
import { defaultSubmitPreset } from '../services/submit/preset';
import { formatLimit, tooLargeMessage } from '../services/submit/sizeTarget';
import { submitDocument } from '../services/submit/submitDocument';
import type { LibraryDocument } from '../types/models';
import { useAppState } from './AppStateContext';

// "Submit" for a document saved earlier (Library selection, Reader): rebuilds the teacher's copy
// with its course's preset as it is now, then opens the share sheet. Returns false when the
// document can't be submitted (no page images, e.g. an imported PDF or a DOCX).
export function useSubmitDocument() {
  const { state, dispatch } = useAppState();
  const { files, courses } = state.library;
  const { profile } = state.settings;

  return useCallback(
    async (doc: LibraryDocument): Promise<boolean> => {
      if (!canSubmit(doc)) {
        dispatch({ type: 'ui/SHOW_SNACK', msg: 'Only scanned documents can be submitted' });
        return false;
      }
      const course = courses.find((c) => c.id === doc.courseId);
      const preset = course?.submitPreset ?? defaultSubmitPreset(doc.courseId ?? null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: preset.sizeLimitBytes ? `Fitting under ${formatLimit(preset.sizeLimitBytes)}…` : 'Building PDF…' });
      try {
        const result = await submitDocument({ doc, preset, profile, course, n: typeNumberOf(doc, files) });
        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: result.fits
            ? `Submitting ${result.fileName} · ${formatLimit(result.sizeBytes)}`
            : tooLargeMessage(result, preset.sizeLimitBytes ?? 0),
        });
        // TODO(§4 S7): record the submission (submissions table) here.
        await shareAs(result.uri, result.fileName, 'application/pdf');
        return true;
      } catch (error) {
        console.warn('useSubmitDocument: submit failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: "Couldn't build the submission" });
        return false;
      }
    },
    [files, courses, profile, dispatch]
  );
}
