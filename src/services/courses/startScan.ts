import type { Dispatch } from 'react';
import type { AppAction, AppState } from '../../store/appReducer';

// Everything that opens Capture for a new scan goes through here, so the course a document will be
// saved to is decided in one place. Scanning from a course page (`courseId`) picks that course in
// Deliver - it beats any suggestion and stays through Review, since deliver state only resets after
// a save. A general scan (tab bar, Home's Scan button) goes back to the automatic course (K5's
// suggestions), dropping a choice left over from an abandoned session - but only when no session
// is in progress: "Add more" to an open session keeps whatever it was going to be filed under.
// `launch`: open the scanner on arrival - true for a "scan now" button, false for the Scan tab,
// which only shows the Capture screen (mode picker, gallery import, shutter).
// `appendTo` (§7 R3): the scanned pages go to the end of that saved document instead of becoming
// a new one. Like the course, a scan started without it drops a target left over from an
// abandoned session, but keeps the one of a session still in progress.
export function startScan(
  state: Pick<AppState, 'capture'>,
  dispatch: Dispatch<AppAction>,
  courseId: string | null,
  { launch, appendTo }: { launch: boolean; appendTo?: string }
) {
  dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
  dispatch({ type: 'capture/REQUEST_SCANNER', requested: launch });
  if (courseId !== null) dispatch({ type: 'deliver/SET_COURSE', courseId });
  else if (state.capture.pages.length === 0) dispatch({ type: 'deliver/AUTO_COURSE' });
  if (appendTo) dispatch({ type: 'deliver/SET_APPEND_TARGET', documentId: appendTo });
  else if (state.capture.pages.length === 0) dispatch({ type: 'deliver/SET_APPEND_TARGET', documentId: null });
}
