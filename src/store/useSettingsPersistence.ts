import { useEffect, useRef } from 'react';
import { loadSettings, persistSettings } from '../services/persistence/settingsStorage';
import { useAppState } from './AppStateContext';
import { useTheme } from '../theme';

export function useSettingsPersistence() {
  const { state, dispatch } = useAppState();
  const { themePref, setThemePref } = useTheme();
  const loaded = useRef(false);

  useEffect(() => {
    loadSettings().then((settings) => {
      if (settings) {
        setThemePref(settings.themePref);
        dispatch({ type: 'settings/SET_FIRST_RUN', firstRun: settings.firstRun });
      }
      loaded.current = true;
    });
  }, [dispatch, setThemePref]);

  useEffect(() => {
    if (!loaded.current) return;
    persistSettings({ themePref, firstRun: state.settings.firstRun });
  }, [themePref, state.settings.firstRun]);
}
