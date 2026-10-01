import type { Dispatch } from 'react';
import type { AppAction, AppState } from '../../store/appReducer';

// Everything that opens Capture for a new scan goes through here, so the course a document will be
// saved to is decided in one place. Scanning from a course page (`courseId`) preselects that
// course in Deliver - and keeps it through Review, since deliver state only resets after a save.
// A general scan (tab bar, Home's Scan button) clears a course left over from an earlier,
// abandoned course scan, but only when no session is in progress: "Add more" to an open session
// keeps whatever it was going to be filed under.
export function startScan(state: Pick<AppState, 'capture'>, dispatch: Dispatch<AppAction>, courseId: string | null) {
  dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
  if (courseId !== null || state.capture.pages.length === 0) dispatch({ type: 'deliver/SET_COURSE', courseId });
}
