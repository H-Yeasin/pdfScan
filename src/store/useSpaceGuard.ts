import { useCallback } from 'react';
import { Alert } from 'react-native';
import { formatBytes, t } from '../i18n';
import { useRouter } from '../navigation/router';
import { checkSpaceFor } from '../services/storage/usage';
import { useAppState } from './AppStateContext';

// The scan warning is shown once per app run: a student who chose "Continue" knows, and asking
// before every scan would only teach them to dismiss it.
let scanWarningShown = false;

// §8 B1: the low-space guard (storage/usage.checkSpaceFor) with its UI.
// - beforeScan(): under 300 MB free, asks once per run, "Free up space" (opens Settings →
//   Storage) or "Continue". Resolves whether to go ahead.
// - beforeSave(bytes): under 50 MB left after the save, stops with a message (the session stays,
//   so nothing is lost); under 300 MB, a warning with "Free up space", and the save goes ahead.
export function useSpaceGuard() {
  const { dispatch } = useAppState();
  const { go } = useRouter();

  const beforeScan = useCallback((): Promise<boolean> => {
    const { level, freeBytes } = checkSpaceFor(0);
    if (level === 'ok' || scanWarningShown) return Promise.resolve(true);
    scanWarningShown = true;
    return new Promise((resolve) => {
      Alert.alert(
        t('shared.space.title'),
        t('shared.space.low', { size: formatBytes(freeBytes ?? 0) }),
        [
          {
            text: t('shared.space.freeUp'),
            onPress: () => {
              resolve(false);
              go('storage');
            },
          },
          { text: t('shared.space.continue'), onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });
  }, [go]);

  const beforeSave = useCallback(
    (bytesNeeded: number): boolean => {
      const { level, freeBytes } = checkSpaceFor(bytesNeeded);
      if (level === 'ok') return true;
      const size = formatBytes(freeBytes ?? 0);
      dispatch({
        type: 'ui/SHOW_SNACK',
        msg: level === 'critical' ? t('shared.space.tooFullToSave', { size }) : t('shared.space.low', { size }),
        action: t('shared.space.freeUp'),
        onAction: () => go('storage'),
      });
      return level !== 'critical';
    },
    [dispatch, go]
  );

  return { beforeScan, beforeSave };
}
