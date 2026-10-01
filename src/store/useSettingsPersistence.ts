import { useEffect } from 'react';
import { isCaptureMode } from '../services/capture/captureModes';
import { loadSettings, persistSettings } from '../services/persistence/settingsStorage';
import { useAppState } from './AppStateContext';
import { useTheme } from '../theme';
import { FILTERS } from '../services/enhance/filters/registry';
import type { CaptureMode, EnhanceMode } from '../types/models';

// Filter IDs are session-only and may be renamed (E1 renamed document_scan); a stored ID that no
// longer exists is dropped rather than handed to the registry.
function sanitizeDefaultEnhance(raw: Partial<Record<CaptureMode, EnhanceMode>> | undefined) {
  const valid = new Set<string>(FILTERS.filter((spec) => spec.available).map((spec) => spec.id));
  const out: Partial<Record<CaptureMode, EnhanceMode>> = {};
  for (const [mode, enhance] of Object.entries(raw ?? {})) if (enhance && valid.has(enhance)) out[mode as CaptureMode] = enhance;
  return out;
}

export function useSettingsPersistence() {
  const { state, dispatch } = useAppState();
  const { themePref, setThemePref } = useTheme();
  const { loaded } = state.settings;

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
        dispatch({ type: 'settings/LOAD_DEFAULT_ENHANCE', byMode: sanitizeDefaultEnhance(settings.defaultEnhanceByMode) });
        dispatch({ type: 'settings/SET_CRASH_REPORTS', enabled: settings.crashReportsEnabled === true });
        dispatch({ type: 'settings/SET_SCANNER_UNAVAILABLE', unavailable: settings.scannerUnavailable === true });
        const opened = settings.lastOpened;
        if (opened && typeof opened.id === 'string' && typeof opened.at === 'number') {
          dispatch({ type: 'settings/SET_LAST_OPENED', lastOpened: opened });
        }
        if (isCaptureMode(settings.lastCaptureMode)) {
          dispatch({ type: 'settings/SET_LAST_CAPTURE_MODE', mode: settings.lastCaptureMode });
        }
      }
      // Only after the stored values are in state, so the save effect below never writes the
      // defaults over them.
      dispatch({ type: 'settings/SET_LOADED' });
    });
  }, [dispatch, setThemePref]);

  useEffect(() => {
    if (!loaded) return;
    persistSettings({
      themePref,
      firstRun: state.settings.firstRun,
      ocrScript: state.settings.ocrScript,
      androidExportFolderUri: state.settings.androidExportFolderUri,
      androidExportFolderLabel: state.settings.androidExportFolderLabel,
      defaultEnhanceByMode: state.settings.defaultEnhanceByMode,
      crashReportsEnabled: state.settings.crashReportsEnabled,
      scannerUnavailable: state.settings.scannerUnavailable,
      lastCaptureMode: state.settings.lastCaptureMode,
      lastOpened: state.settings.lastOpened,
    });
  }, [
    loaded,
    themePref,
    state.settings.firstRun,
    state.settings.ocrScript,
    state.settings.androidExportFolderUri,
    state.settings.androidExportFolderLabel,
    state.settings.defaultEnhanceByMode,
    state.settings.crashReportsEnabled,
    state.settings.scannerUnavailable,
    state.settings.lastCaptureMode,
    state.settings.lastOpened,
  ]);
}
