import type { OcrScript } from '../../types/models';

export type SettingsState = {
  firstRun: boolean;
  ocrScript: OcrScript;
  // Android-only: persisted SAF tree URI for "also save a copy to device" exports.
  androidExportFolderUri: string | null;
  androidExportFolderLabel: string | null;
  // Opt-in, off by default: see services/telemetry/crash.ts.
  crashReportsEnabled: boolean;
};

export const initialSettingsState: SettingsState = {
  firstRun: true,
  ocrScript: 'latin',
  androidExportFolderUri: null,
  androidExportFolderLabel: null,
  crashReportsEnabled: false,
};

export type SettingsAction =
  | { type: 'settings/SET_FIRST_RUN'; firstRun: boolean }
  | { type: 'settings/SET_OCR_SCRIPT'; script: OcrScript }
  | { type: 'settings/SET_ANDROID_EXPORT_FOLDER'; uri: string | null; label: string | null }
  | { type: 'settings/SET_CRASH_REPORTS'; enabled: boolean };

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
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
