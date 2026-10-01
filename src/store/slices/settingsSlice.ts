import { getCaptureModeSpec } from '../../services/capture/captureModes';
import type { CaptureModeSpec } from '../../services/capture/captureModes';
import type { CaptureMode, EnhanceMode, OcrScript } from '../../types/models';

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
  // The filter the user last applied to all pages, per capture mode. New pages in that mode start
  // with it (over the built-in default) - see defaultEnhanceFor.
  defaultEnhanceByMode: Partial<Record<CaptureMode, EnhanceMode>>;
  // Opt-in, off by default: see services/telemetry/crash.ts.
  crashReportsEnabled: boolean;
  // Google's document scanner failed in a way that means it can't run on this phone (no or
  // outdated Play services); scans go straight to the basic camera fallback (scannerFallback.ts).
  scannerUnavailable: boolean;
};

export const initialSettingsState: SettingsState = {
  loaded: false,
  firstRun: true,
  lastCaptureMode: 'doc',
  ocrScript: 'latin',
  androidExportFolderUri: null,
  androidExportFolderLabel: null,
  defaultEnhanceByMode: {},
  crashReportsEnabled: false,
  scannerUnavailable: false,
};

// The user's "apply to all" choice for this mode wins over the mode's built-in default.
export function defaultEnhanceFor(settings: SettingsState, mode: CaptureMode): EnhanceMode {
  return settings.defaultEnhanceByMode[mode] ?? getCaptureModeSpec(mode).defaultEnhance;
}

// The mode's spec with defaultEnhance resolved through defaultEnhanceFor, which is what every
// ingest path (scanner, gallery) should be handed.
export function captureSpecFor(settings: SettingsState, mode: CaptureMode): CaptureModeSpec {
  return { ...getCaptureModeSpec(mode), defaultEnhance: defaultEnhanceFor(settings, mode) };
}

export type SettingsAction =
  | { type: 'settings/SET_LOADED' }
  | { type: 'settings/SET_FIRST_RUN'; firstRun: boolean }
  | { type: 'settings/SET_LAST_CAPTURE_MODE'; mode: CaptureMode }
  | { type: 'settings/SET_OCR_SCRIPT'; script: OcrScript }
  | { type: 'settings/SET_ANDROID_EXPORT_FOLDER'; uri: string | null; label: string | null }
  | { type: 'settings/SET_DEFAULT_ENHANCE'; mode: CaptureMode; enhance: EnhanceMode }
  | { type: 'settings/LOAD_DEFAULT_ENHANCE'; byMode: Partial<Record<CaptureMode, EnhanceMode>> }
  | { type: 'settings/SET_CRASH_REPORTS'; enabled: boolean }
  | { type: 'settings/SET_SCANNER_UNAVAILABLE'; unavailable: boolean };

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
    case 'settings/SET_DEFAULT_ENHANCE':
      return { ...state, defaultEnhanceByMode: { ...state.defaultEnhanceByMode, [action.mode]: action.enhance } };
    case 'settings/LOAD_DEFAULT_ENHANCE':
      return { ...state, defaultEnhanceByMode: action.byMode };
    case 'settings/SET_CRASH_REPORTS':
      return { ...state, crashReportsEnabled: action.enabled };
    case 'settings/SET_SCANNER_UNAVAILABLE':
      return { ...state, scannerUnavailable: action.unavailable };
    default:
      return state;
  }
}
