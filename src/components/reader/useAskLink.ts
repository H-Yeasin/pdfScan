import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useT } from '../../i18n/useT';
import { shownUrl } from '../../services/reader/links';
import { useAppDispatch } from '../../store/AppStateContext';

// §18 W11: a link out of the app is never followed on the tap: the address is shown first, with
// Open, Copy and Cancel. `url` has been through links.safeLinkUrl (http, https, mailto, tel).
// §18 W22: the DOCX viewer asks the same way.
export function useAskLink() {
  const { t } = useT();
  const dispatch = useAppDispatch();
  return useCallback(
    (url: string) => {
      Alert.alert(
        t('reader.link.title'),
        shownUrl(url),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('reader.link.copy'),
            onPress: () => {
              Clipboard.setStringAsync(url)
                .then(() => dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.link.copied') }))
                .catch(() => undefined);
            },
          },
          {
            text: t('reader.link.open'),
            onPress: () => {
              Linking.openURL(url).catch(() => dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.link.cantOpen') }));
            },
          },
        ],
        { cancelable: true }
      );
    },
    [t, dispatch]
  );
}
