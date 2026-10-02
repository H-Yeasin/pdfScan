import type { DocumentLanguage, UiLanguage } from '../../i18n';
import { getCaptureModeSpec } from '../../services/capture/captureModes';
import type { CaptureModeSpec } from '../../services/capture/captureModes';
import { DEFAULT_NAME_TEMPLATE } from '../../services/submit/naming';
import { EMPTY_PROFILE } from '../../services/submit/profile';
import type { CaptureMode, EnhanceMode, OcrScript, StudentProfile } from '../../types/models';
import type { AutoBackupFrequency } from '../../services/backup/schedule';

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
  // §6 L4: the language of text that goes into documents (cover labels, footers, the {type} file
  // name token). 'ui' follows the app language; a Bangla UI can still make English covers.
  documentLanguage: DocumentLanguage;
  // §8 B3: when the last full backup was handed over (shared or saved) and how big it was. null:
  // never. Course and document exports don't count.
  lastBackupAt: number | null;
  lastBackupBytes: number | null;
  // §8 B3, Android: the SAF folder backups are saved to (kept apart from the export folder above,
  // so B5's automatic backups only ever rotate files in a folder chosen for them).
  backupFolderUri: string | null;
  backupFolderLabel: string | null;
  // §8 B5: Home's "Back up now?" card was put off until then (Later: 14 days). null: not snoozed.
  backupReminderSnoozedUntil: number | null;
  // §8 B5, Android: automatic backups to the backup folder, and the zips they made there (oldest
  // first; only these are ever deleted by the rotation).
  autoBackup: AutoBackupFrequency;
  lastAutoBackupAt: number | null;
  autoBackupUris: string[];
  // §9 O2: the introduction was finished or skipped (or never needed: an existing library).
  onboardingDone: boolean;
  // §9 O3: the one-time hints already shown (services/hints/hints.ts ids).
  hintsSeen: string[];
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
  documentLanguage: 'ui',
  lastBackupAt: null,
  lastBackupBytes: null,
  backupFolderUri: null,
  backupFolderLabel: null,
  backupReminderSnoozedUntil: null,
  autoBackup: 'off',
  lastAutoBackupAt: null,
  autoBackupUris: [],
  onboardingDone: false,
  hintsSeen: [],
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
  | { type: 'settings/SET_UI_LANGUAGE'; language: UiLanguage }
  | { type: 'settings/SET_DOCUMENT_LANGUAGE'; language: DocumentLanguage }
  | { type: 'settings/SET_LAST_BACKUP'; at: number | null; bytes: number | null }
  | { type: 'settings/SET_BACKUP_FOLDER'; uri: string | null; label: string | null }
  | { type: 'settings/SNOOZE_BACKUP_REMINDER'; until: number | null }
  | { type: 'settings/SET_AUTO_BACKUP'; frequency: AutoBackupFrequency }
  | { type: 'settings/AUTO_BACKUP_DONE'; at: number; bytes: number; uris: string[] }
  | { type: 'settings/LOAD_AUTO_BACKUP_STATE'; lastAt: number | null; uris: string[] }
  | { type: 'settings/SET_ONBOARDING_DONE'; done: boolean }
  | { type: 'settings/MARK_HINT_SEEN'; id: string }
  | { type: 'settings/LOAD_HINTS_SEEN'; ids: string[] };

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
    case 'settings/SET_LAST_BACKUP':
      return { ...state, lastBackupAt: action.at, lastBackupBytes: action.bytes };
    case 'settings/SET_BACKUP_FOLDER':
      return { ...state, backupFolderUri: action.uri, backupFolderLabel: action.label };
    case 'settings/MARK_HINT_SEEN':
      return state.hintsSeen.includes(action.id) ? state : { ...state, hintsSeen: [...state.hintsSeen, action.id] };
    case 'settings/LOAD_HINTS_SEEN':
      // Merged, not replaced: a hint shown before the stored list loaded stays seen.
      return { ...state, hintsSeen: [...new Set([...action.ids, ...state.hintsSeen])] };
    case 'settings/SET_ONBOARDING_DONE':
      return { ...state, onboardingDone: action.done };
    case 'settings/SNOOZE_BACKUP_REMINDER':
      return { ...state, backupReminderSnoozedUntil: action.until };
    case 'settings/SET_AUTO_BACKUP':
      return { ...state, autoBackup: action.frequency };
    // An automatic backup is a full backup handed over too.
    case 'settings/AUTO_BACKUP_DONE':
      return { ...state, lastAutoBackupAt: action.at, autoBackupUris: action.uris, lastBackupAt: action.at, lastBackupBytes: action.bytes };
    case 'settings/LOAD_AUTO_BACKUP_STATE':
      return { ...state, lastAutoBackupAt: action.lastAt, autoBackupUris: action.uris };
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
    case 'settings/SET_DOCUMENT_LANGUAGE':
      return { ...state, documentLanguage: action.language };
    default:
      return state;
  }
}
