import type { CaptureMode, OcrScript } from '../../types/models';

export type SettingsState = {
  // False until persisted settings have been read, so first-run-dependent behaviour (like the
  // Capture screen's auto-launch) doesn't act on defaults.
  loaded: boolean;
  // True until the user has picked a capture mode or started a scan once.
  firstRun: boolean;
  // Restored into capture.mode when the Capture screen opens.
  lastCaptureMode: CaptureMode;
  ocrScript: OcrScript;
  // Android-only: persisted SAF tree URI for "also save a copy to device" exports.
  androidExportFolderUri: string | null;
  androidExportFolderLabel: string | null;
  // Opt-in, off by default: see services/telemetry/crash.ts.
  crashReportsEnabled: boolean;
};

export const initialSettingsState: SettingsState = {
  loaded: false,
  firstRun: true,
  lastCaptureMode: 'doc',
  ocrScript: 'latin',
  androidExportFolderUri: null,
  androidExportFolderLabel: null,
  crashReportsEnabled: false,
};

export type SettingsAction =
  | { type: 'settings/SET_LOADED' }
  | { type: 'settings/SET_FIRST_RUN'; firstRun: boolean }
  | { type: 'settings/SET_LAST_CAPTURE_MODE'; mode: CaptureMode }
  | { type: 'settings/SET_OCR_SCRIPT'; script: OcrScript }
  | { type: 'settings/SET_ANDROID_EXPORT_FOLDER'; uri: string | null; label: string | null }
  | { type: 'settings/SET_CRASH_REPORTS'; enabled: boolean };

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'settings/SET_LOADED':
      return { ...state, loaded: true };
    case 'settings/SET_LAST_CAPTURE_MODE':
      return { ...state, lastCaptureMode: action.mode };
    case 'settings/SET_FIRST_RUN':
      return { ...state, firstRun: action.firstRun };
    case 'settings/SET_OCR_SCRIPT':
      return { ...state, ocrScript: action.script };
    case 'settings/SET_ANDROID_EXPORT_FOLDER':
      return { ...state, androidExportFolderUri: action.uri, androidExportFolderLabel: action.label };
    case 'settings/SET_CRASH_REPORTS':
      return { ...state, crashReportsEnabled: action.enabled };
    default:
      return state;
  }
}
