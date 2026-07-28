export type SettingsState = {
  firstRun: boolean;
};

export const initialSettingsState: SettingsState = {
  firstRun: true,
};

export type SettingsAction = { type: 'settings/SET_FIRST_RUN'; firstRun: boolean };

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'settings/SET_FIRST_RUN':
      return { ...state, firstRun: action.firstRun };
    default:
      return state;
  }
}
