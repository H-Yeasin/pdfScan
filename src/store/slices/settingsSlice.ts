import type { UiLanguage } from '../../i18n';
import { getCaptureModeSpec } from '../../services/capture/captureModes';
import type { CaptureModeSpec } from '../../services/capture/captureModes';
import { DEFAULT_NAME_TEMPLATE } from '../../services/submit/naming';
import { EMPTY_PROFILE } from '../../services/submit/profile';
import type { CaptureMode, EnhanceMode, OcrScript, StudentProfile } from '../../types/models';

export type SettingsState = {
  // False until persisted settings have been read, so first-run-dependent behaviour (like the
  // Capture screen's requested scanner launch) doesn't act on defaults.
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
  // The library document last opened in the Reader, for Home's "Continue" card
  // (homeSelectors.continueDocument).
  lastOpened: { id: string; at: number } | null;
  // Name, roll, section and institution for §4's file names, cover pages and footers.
  profile: StudentProfile;
  // How Deliver names a new document (services/submit/naming.ts). S6 adds a per-course override.
  nameTemplate: string;
  // True once the first Submit has asked for the name and roll (answered or skipped), so it
  // never asks again; Settings > Profile is always there.
  profilePrompted: boolean;
  // §3 K6: the Unsorted page's "n documents have no course. Sort them now?" banner was answered
  // or dismissed, so it isn't shown again.
  unsortedPromptDone: boolean;
  // §6 L4: the app's language. 'system' follows the phone (the first of its languages that has a
  // catalog, else English); 'en-XA' is the developer pseudo-locale (dev builds only).
  uiLanguage: UiLanguage;
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
  lastOpened: null,
  profile: EMPTY_PROFILE,
  nameTemplate: DEFAULT_NAME_TEMPLATE,
  profilePrompted: false,
  unsortedPromptDone: false,
  uiLanguage: 'system',
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
  | { type: 'settings/SET_SCANNER_UNAVAILABLE'; unavailable: boolean }
  | { type: 'settings/SET_LAST_OPENED'; lastOpened: { id: string; at: number } | null }
  // A partial patch, so each profile field can be edited on its own.
  | { type: 'settings/SET_PROFILE'; profile: Partial<StudentProfile> }
  | { type: 'settings/SET_NAME_TEMPLATE'; template: string }
  | { type: 'settings/SET_PROFILE_PROMPTED' }
  | { type: 'settings/SET_UNSORTED_PROMPT_DONE' }
  | { type: 'settings/SET_UI_LANGUAGE'; language: UiLanguage };

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
    case 'settings/SET_LAST_OPENED':
      return { ...state, lastOpened: action.lastOpened };
    case 'settings/SET_PROFILE':
      return { ...state, profile: { ...state.profile, ...action.profile } };
    case 'settings/SET_UNSORTED_PROMPT_DONE':
      return { ...state, unsortedPromptDone: true };
    case 'settings/SET_PROFILE_PROMPTED':
      return { ...state, profilePrompted: true };
    case 'settings/SET_NAME_TEMPLATE':
      return { ...state, nameTemplate: action.template };
    case 'settings/SET_UI_LANGUAGE':
      return { ...state, uiLanguage: action.language };
    default:
      return state;
  }
}
