import type { Dispatch } from 'react';
import { Alert } from 'react-native';
import { t } from '../../i18n';
import { cancelProcessing } from '../../services/capture/processingSession';
import { hapticWarning } from '../../services/feedback/haptics';
import type { AppAction } from '../../store/appReducer';

// Asks before an unsaved scan goes, then empties the session and calls `then`. Android Back from
// Review (AppNavigator, backHandling's confirmDiscard) and Review's × (§17 U9) both come here.
// An Alert until U3's Dialog.
export function askDiscardScan(dispatch: Dispatch<AppAction>, count: number, then: () => void): void {
  // §17 U13: a destructive confirm asking is a warning buzz.
  hapticWarning();
  Alert.alert(t('shared.discardScan.title', { count }), t('shared.discardScan.body'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('shared.discardScan.discard'),
      style: 'destructive',
      onPress: () => {
        // A batch still coming in stops first, so no page lands in the emptied session.
        cancelProcessing();
        (require('../../services/capture/ingestBatch') as typeof import('../../services/capture/ingestBatch')).stopReadingText();
        dispatch({ type: 'capture/SET_RETAKE_TARGET', id: null });
        dispatch({ type: 'capture/CLEAR_PAGES' });
        dispatch({ type: 'review/RESET' });
        then();
      },
    },
  ]);
}
