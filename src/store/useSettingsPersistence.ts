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
        dispatch({
          type: 'settings/SET_ANDROID_EXPORT_FOLDER',
          uri: settings.androidExportFolderUri ?? null,
          label: settings.androidExportFolderLabel ?? null,
        });
        dispatch({ type: 'settings/SET_CRASH_REPORTS', enabled: settings.crashReportsEnabled === true });
      }
      loaded.current = true;
    });
  }, [dispatch, setThemePref]);

  useEffect(() => {
    if (!loaded.current) return;
    persistSettings({
      themePref,
      firstRun: state.settings.firstRun,
      ocrScript: state.settings.ocrScript,
      androidExportFolderUri: state.settings.androidExportFolderUri,
      androidExportFolderLabel: state.settings.androidExportFolderLabel,
      crashReportsEnabled: state.settings.crashReportsEnabled,
    });
  }, [
    themePref,
    state.settings.firstRun,
    state.settings.ocrScript,
    state.settings.androidExportFolderUri,
    state.settings.androidExportFolderLabel,
    state.settings.crashReportsEnabled,
  ]);
}
