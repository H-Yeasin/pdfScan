import type { OcrScript } from '../../types/models';

export type SettingsState = {
  firstRun: boolean;
  ocrScript: OcrScript;
};

export const initialSettingsState: SettingsState = {
  firstRun: true,
  ocrScript: 'latin',
};

export type SettingsAction =
  | { type: 'settings/SET_FIRST_RUN'; firstRun: boolean }
  | { type: 'settings/SET_OCR_SCRIPT'; script: OcrScript };

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'settings/SET_FIRST_RUN':
      return { ...state, firstRun: action.firstRun };
    case 'settings/SET_OCR_SCRIPT':
      return { ...state, ocrScript: action.script };
    default:
      return state;
  }
}
