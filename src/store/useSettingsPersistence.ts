import { useEffect, useRef } from 'react';
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
        dispatch({ type: 'settings/LOAD_DEFAULT_ENHANCE', byMode: sanitizeDefaultEnhance(settings.defaultEnhanceByMode) });
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
      defaultEnhanceByMode: state.settings.defaultEnhanceByMode,
    });
  }, [
    themePref,
    state.settings.firstRun,
    state.settings.ocrScript,
    state.settings.androidExportFolderUri,
    state.settings.androidExportFolderLabel,
    state.settings.defaultEnhanceByMode,
  ]);
}
