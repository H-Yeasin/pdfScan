import type { CaptureMode, EnhanceMode, OcrScript } from '../../types/models';

export type SettingsState = {
  firstRun: boolean;
  ocrScript: OcrScript;
  // Android-only: persisted SAF tree URI for "also save a copy to device" exports.
  androidExportFolderUri: string | null;
  androidExportFolderLabel: string | null;
  // The filter the user last applied to all pages, per capture mode. New pages in that mode start
  // with it (over the built-in default) - see defaultEnhanceFor.
  defaultEnhanceByMode: Partial<Record<CaptureMode, EnhanceMode>>;
};

export const initialSettingsState: SettingsState = {
  firstRun: true,
  ocrScript: 'latin',
  androidExportFolderUri: null,
  androidExportFolderLabel: null,
  defaultEnhanceByMode: {},
};

// Built-in default until C1 gives each mode its own (Notes -> ink, Board -> board, ...).
const BUILT_IN_DEFAULT_ENHANCE: EnhanceMode = 'auto';

export function defaultEnhanceFor(settings: SettingsState, mode: CaptureMode): EnhanceMode {
  return settings.defaultEnhanceByMode[mode] ?? BUILT_IN_DEFAULT_ENHANCE;
}

export type SettingsAction =
  | { type: 'settings/SET_FIRST_RUN'; firstRun: boolean }
  | { type: 'settings/SET_OCR_SCRIPT'; script: OcrScript }
  | { type: 'settings/SET_ANDROID_EXPORT_FOLDER'; uri: string | null; label: string | null }
  | { type: 'settings/SET_DEFAULT_ENHANCE'; mode: CaptureMode; enhance: EnhanceMode }
  | { type: 'settings/LOAD_DEFAULT_ENHANCE'; byMode: Partial<Record<CaptureMode, EnhanceMode>> };

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
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
    default:
      return state;
  }
}
