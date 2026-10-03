import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { t } from '../../i18n';
import { pendingTaskToResume, resumeProTask } from '../../services/pro/proTaskFlow';
import { clearPendingTask } from '../../services/pro/proTask';
import { useAppStore } from '../../store/AppStateContext';
// The runners of the Pro tasks, registered at module load so a pending task finds its runner.
import '../../services/convert/convertTask';

// §12 D1: Android may kill the app during a long ad. If the student watched to the end, the
// task they asked for is offered once at the next start ("Finish converting 'Handout.docx'?"),
// within the hour; anything else is quietly dropped. Mounted inside AppLockGate, so it asks only
// after the unlock, and only once the library is in (`ready`), since a task writes to it.
export function ProTaskResumeHost({ ready }: { ready: boolean }) {
  const store = useAppStore();
  const checked = useRef(false);

  useEffect(() => {
    if (!ready || checked.current) return;
    checked.current = true;
    void pendingTaskToResume(Date.now()).then((task) => {
      if (!task) return;
      Alert.alert(t('pro.task.resumeTitle'), t(`pro.task.resumeBody.${task.feature}`, { name: task.title }), [
        { text: t('pro.task.notNow'), style: 'cancel', onPress: () => void clearPendingTask(task.id) },
        {
          text: t('pro.task.resume'),
          onPress: () => {
            resumeProTask(task, store).catch((e: unknown) => console.warn('Could not finish the Pro task', e));
          },
        },
      ]);
    });
  }, [ready, store]);

  return null;
}
