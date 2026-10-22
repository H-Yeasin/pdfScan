import { useMemo } from 'react';
import { useT } from '../../i18n/useT';
import { CAPTURE_MODES } from '../../services/capture/captureModes';
import { startScan } from '../../services/courses/startScan';
import { useAppDispatch, useAppSelector, useAppStore } from '../../store/AppStateContext';
import { useGalleryImport } from '../../store/useGalleryImport';
import { useImportFile } from '../../store/useImportFile';
import { ICONS } from '../../theme';
import type { CaptureMode } from '../../types/models';
import { Menu, type MenuSection } from '../ui';

// §17 U5: what a long-press on the tab bar's Scan button opens (and the one-time hint's "Choose a
// mode"): the five capture modes with what each is for, then the other ways in. A mode is
// remembered (settings.lastCaptureMode, the mode a plain tap scans in) and scans at once. It took
// over from CaptureScreen's mode picker and gallery button.
//
// On U3's Menu, so it becomes a Sheet with it; until then the Menu's own Modal.

type ScanSheetId = CaptureMode | 'gallery' | 'file';

export function scanModeSections(
  t: ReturnType<typeof useT>['t'],
  lastMode: CaptureMode
): MenuSection<ScanSheetId>[] {
  return [
    {
      title: t('capture.modeSheet.scanAs'),
      items: CAPTURE_MODES.map((spec) => ({
        id: spec.id,
        label: t(spec.labelKey),
        hint: t(spec.hintKey),
        icon: spec.icon,
        badge: spec.id === lastMode ? { label: t('capture.modeSheet.last'), tone: 'accent' as const } : undefined,
      })),
    },
    {
      title: t('capture.modeSheet.bringIn'),
      items: [
        { id: 'gallery', label: t('capture.modeSheet.importPhotos'), icon: ICONS.gallery },
        { id: 'file', label: t('capture.modeSheet.importFile'), icon: ICONS.import },
      ],
    },
  ];
}

export function ScanModeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const lastMode = useAppSelector((s) => s.settings.lastCaptureMode);
  const importPhotos = useGalleryImport();
  const importFile = useImportFile();
  const sections = useMemo(() => scanModeSections(t, lastMode), [t, lastMode]);

  const onSelect = (id: ScanSheetId) => {
    if (id === 'file') {
      void importFile();
      return;
    }
    if (id === 'gallery') {
      // The photos go into a session like a scan's: same course rules, the last mode's filter.
      startScan(store.getState(), dispatch, null, { launch: false });
      void importPhotos();
      return;
    }
    dispatch({ type: 'settings/SET_LAST_CAPTURE_MODE', mode: id });
    startScan(store.getState(), dispatch, null, { launch: true, mode: id });
  };

  return <Menu visible={visible} onClose={onClose} onSelect={onSelect} sections={sections} title={t('capture.modeSheet.title')} />;
}
