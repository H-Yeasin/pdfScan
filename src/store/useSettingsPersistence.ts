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
        dispatch({ type: 'settings/SET_OCR_SCRIPT', script: settings.ocrScript });
      }
      loaded.current = true;
    });
  }, [dispatch, setThemePref]);

  useEffect(() => {
    if (!loaded.current) return;
    persistSettings({ themePref, firstRun: state.settings.firstRun, ocrScript: state.settings.ocrScript });
  }, [themePref, state.settings.firstRun, state.settings.ocrScript]);
}
