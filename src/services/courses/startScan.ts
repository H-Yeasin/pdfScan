import type { Dispatch } from 'react';
import type { AppAction, AppState } from '../../store/appReducer';
import type { CaptureMode } from '../../types/models';

// Everything that starts a scan goes through here, so the course a document will be
// saved to is decided in one place. Scanning from a course page (`courseId`) picks that course in
// Deliver - it beats any suggestion and stays through Review, since deliver state only resets after
// a save. A general scan (tab bar, Home's Scan button) goes back to the automatic course (K5's
// suggestions), dropping a choice left over from an abandoned session - but only when no session
// is in progress: "Add more" to an open session keeps whatever it was going to be filed under.
// `launch`: open the scanner now (components/capture/ScanLauncher does, §17 U5). False only
// prepares the session (the gallery import, which picks photos instead).
// `mode`: the capture mode to scan in - only for a new session: "Add more" keeps the session's own.
// Without it a new session starts in the last mode used (settings.lastCaptureMode).
// `appendTo` (§7 R3): the scanned pages go to the end of that saved document instead of becoming
// a new one. Like the course, a scan started without it drops a target left over from an
// abandoned session, but keeps the one of a session still in progress.
export function startScan(
  state: Pick<AppState, 'capture' | 'settings'>,
  dispatch: Dispatch<AppAction>,
  courseId: string | null,
  { launch, appendTo, mode }: { launch: boolean; appendTo?: string; mode?: CaptureMode }
) {
  dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
  if (state.capture.pages.length === 0) {
    const next = mode ?? state.settings.lastCaptureMode;
    if (next !== state.capture.mode) dispatch({ type: 'capture/SET_MODE', mode: next });
  }
  dispatch({ type: 'capture/REQUEST_SCANNER', requested: launch });
  if (courseId !== null) dispatch({ type: 'deliver/SET_COURSE', courseId });
  else if (state.capture.pages.length === 0) dispatch({ type: 'deliver/AUTO_COURSE' });
  if (appendTo) dispatch({ type: 'deliver/SET_APPEND_TARGET', documentId: appendTo });
  else if (state.capture.pages.length === 0) dispatch({ type: 'deliver/SET_APPEND_TARGET', documentId: null });
}
