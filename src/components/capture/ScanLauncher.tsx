import { useEffect } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '../../store/AppStateContext';
import { captureSpecFor } from '../../store/slices/settingsSlice';
import { scanOcrScriptNow } from '../../store/useScanOcrScript';
import { useSpaceGuard } from '../../store/useSpaceGuard';

// §17 U5: opens the scanner whenever something asks for it (capture.scannerRequested: the tab
// bar's Scan button and its mode sheet, a course's Scan, Review's Retake / Add more / Start, the
// Reader's Add pages - all through startScan or REQUEST_SCANNER). It used to be CaptureScreen's
// effect, which only ran once that screen was shown; with the screen gone, it's mounted once by
// AppNavigator, inside the app lock, and renders nothing. AppNavigator pushes Review when the
// pages land (processingStatus 'scanning' → 'processing'); a cancelled scan leaves the student
// where they were.
//
// Reads one field; the rest is read from the store when a launch is asked for, so a scan's
// progress doesn't re-render it. Waits for settings, so a returning user's last mode is known.
export function ScanLauncher() {
  const requested = useAppSelector((s) => s.capture.scannerRequested);
  const settingsLoaded = useAppSelector((s) => s.settings.loaded);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { beforeScan } = useSpaceGuard();

  useEffect(() => {
    if (!requested || !settingsLoaded) return;
    // Consumed first, so one request launches once.
    dispatch({ type: 'capture/REQUEST_SCANNER', requested: false });
    const state = store.getState();
    const { processingStatus, mode } = state.capture;
    if (processingStatus === 'scanning' || processingStatus === 'processing') return;
    // Counts as having scanned (the flag CaptureScreen's mode picker used to clear).
    if (state.settings.firstRun) dispatch({ type: 'settings/SET_FIRST_RUN', firstRun: false });
    const spec = captureSpecFor(state.settings, mode);
    const script = scanOcrScriptNow(state);
    const { scannerUnavailable } = state.settings;
    void beforeScan().then((proceed) => {
      if (!proceed) return;
      // Required here: the scanner plugin and the ingest pipeline load on the first scan, not at
      // boot (§16 G3).
      const { runNativeScannerPipeline } = require('../../services/capture/scannerPipeline') as typeof import('../../services/capture/scannerPipeline');
      void runNativeScannerPipeline(dispatch, script, spec, { scannerUnavailable });
    });
  }, [requested, settingsLoaded, dispatch, store, beforeScan]);

  return null;
}
