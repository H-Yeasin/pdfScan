import { Alert } from 'react-native';
import { t } from '../../i18n';

// §17 U11: Clear empties the exam pack in one tap, so it asks first (destructive). The documents the
// pages came from are not touched. An Alert until U3's Dialog / useConfirm.
export function confirmClearPack(count: number, onClear: () => void): void {
  Alert.alert(t('study.pack.clearTitle'), t('study.pack.clearBody', { count }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('study.pack.clear'), style: 'destructive', onPress: onClear },
  ]);
}
