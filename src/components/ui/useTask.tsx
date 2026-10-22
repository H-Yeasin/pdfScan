import { useCallback, type Dispatch } from 'react';
import { t, type TKey } from '../../i18n';
import { runTask, type TaskControl, type TaskResult } from '../../services/feedback/task';
import { hapticSuccess } from '../../services/feedback/haptics';
import { useAppDispatch } from '../../store/AppStateContext';
import type { AppAction } from '../../store/appReducer';
import { createId } from '../../utils/id';

// §17 U13: run a long job with a small toast where the snack sits ("Merging… 3 of 5", Cancel),
// which turns into the result snack. The host is components/shared/Snackbar (state.ui.task).
//
//   const { run } = useTask();
//   await run('library.merging', (task) => merge(docs, { onProgress: task.progress }), {
//     done: (doc) => t('library.mergedInto', { name: doc.name }),
//   });
//
// A job that dispatches its own snack (one with Undo or Open) leaves `done` out: the snack it shows
// after the toast is the result. A failure says `failed(error)` or the generic "Couldn't do that".

export type TaskOptions<T> = {
  // Cancel on the toast. The job must check `task.throwIfCancelled()` between its steps.
  cancellable?: boolean;
  // The result snack, from the job's value; nothing (undefined) leaves the job's own snack.
  done?: (value: T) => string | undefined;
  // The snack for a failure; the default is library.toolFailed.
  failed?: (error: unknown) => string;
  // A success buzz (haptics.ts's map: a tool done).
  haptic?: boolean;
};

// The same without a hook, for code that only has `dispatch` (documentActions, tested without
// rendering).
export async function runWithToast<T>(
  dispatch: Dispatch<AppAction>,
  labelKey: TKey,
  job: (task: TaskControl) => Promise<T>,
  options: TaskOptions<T> = {}
): Promise<TaskResult<T>> {
  const id = createId('task');
  const result = await runTask(
    job,
    {
      start: (onCancel) => dispatch({ type: 'ui/TASK_START', task: { id, label: t(labelKey), onCancel } }),
      progress: (done, total) => dispatch({ type: 'ui/TASK_PROGRESS', id, done, total }),
      end: () => dispatch({ type: 'ui/TASK_END', id }),
    },
    options.cancellable
  );
  const snack = (msg: string) => dispatch({ type: 'ui/SHOW_SNACK', msg });
  if (result.status === 'done') {
    if (options.haptic) hapticSuccess();
    const msg = options.done?.(result.value);
    if (msg) snack(msg);
  } else if (result.status === 'cancelled') {
    snack(t('ui.task.cancelled'));
  } else {
    console.warn('runWithToast: failed', labelKey, result.error);
    snack(options.failed ? options.failed(result.error) : t('library.toolFailed'));
  }
  return result;
}

export function useTask() {
  const dispatch = useAppDispatch();
  const run = useCallback(
    <T,>(labelKey: TKey, job: (task: TaskControl) => Promise<T>, options?: TaskOptions<T>) => runWithToast(dispatch, labelKey, job, options),
    [dispatch]
  );
  return { run };
}
