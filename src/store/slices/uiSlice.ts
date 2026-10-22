import type { BackupScope } from '../../services/backup/format';

// §8 B5: an export or backup asked for from somewhere that can't show its dialog (a snack action,
// Home's reminder card). ExportHost (always mounted) runs it.
export type ExportRequest = { scope: BackupScope; courseName?: string };

export type Snack = { msg: string; action?: string; onAction?: () => void } | null;

// §17 U13: a long job running (components/ui/useTask), shown where the snack sits. `done`/`total`
// once the job counts ("3 of 5"); `onCancel` when it can stop.
export type TaskToast = { id: string; label: string; done?: number; total?: number; onCancel?: () => void };

export type UiState = {
  snack: Snack;
  // While a task runs it takes the snack's place; snacks that come meanwhile wait under it.
  task: TaskToast | null;
  // §9 O6: snacks waiting behind one that has an action (Undo, Done, Scan more), so a later
  // message doesn't take that action away. A plain message is simply replaced.
  snackQueue: NonNullable<Snack>[];
  // §8 B4: a zip to restore or import (a file:// copy in the cache), from Settings → Backup, the
  // Library's file picker or "Open with". RestoreHost (always mounted) takes it from here.
  backupToOpen: string | null;
  exportRequest: ExportRequest | null;
  // §8 B5: an automatic backup running in the background, 0..1. null: none.
  autoBackupProgress: number | null;
};

export const initialUiState: UiState = {
  snack: null,
  task: null,
  snackQueue: [],
  backupToOpen: null,
  exportRequest: null,
  autoBackupProgress: null,
};

export type UiAction =
  | { type: 'ui/SHOW_SNACK'; msg: string; action?: string; onAction?: () => void }
  | { type: 'ui/CLEAR_SNACK' }
  | { type: 'ui/TASK_START'; task: TaskToast }
  | { type: 'ui/TASK_PROGRESS'; id: string; done: number; total: number }
  | { type: 'ui/TASK_END'; id: string }
  | { type: 'ui/OPEN_BACKUP'; uri: string }
  | { type: 'ui/CLOSE_BACKUP' }
  | { type: 'ui/REQUEST_EXPORT'; request: ExportRequest | null }
  | { type: 'ui/SET_AUTO_BACKUP_PROGRESS'; progress: number | null };

const MAX_QUEUED_SNACKS = 3;

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'ui/SHOW_SNACK': {
      const next = { msg: action.msg, action: action.action, onAction: action.onAction };
      if (state.snack?.action && state.snack.msg !== next.msg) {
        // At most a few waiting: anything older is stale by the time it would show.
        return { ...state, snackQueue: [...state.snackQueue, next].slice(-MAX_QUEUED_SNACKS) };
      }
      return { ...state, snack: next };
    }
    case 'ui/CLEAR_SNACK':
      if (!state.snack && state.snackQueue.length === 0) return state;
      return { ...state, snack: state.snackQueue[0] ?? null, snackQueue: state.snackQueue.slice(1) };
    // A newer task replaces an older one's toast (two jobs at once are rare: the toast shows the
    // last one started; the older one's progress and end are ignored by id).
    case 'ui/TASK_START':
      return { ...state, task: action.task };
    case 'ui/TASK_PROGRESS': {
      const { task } = state;
      if (!task || task.id !== action.id || (task.done === action.done && task.total === action.total)) return state;
      return { ...state, task: { ...task, done: action.done, total: action.total } };
    }
    case 'ui/TASK_END':
      return state.task?.id === action.id ? { ...state, task: null } : state;
    case 'ui/OPEN_BACKUP':
      return { ...state, backupToOpen: action.uri };
    case 'ui/CLOSE_BACKUP':
      return { ...state, backupToOpen: null };
    case 'ui/REQUEST_EXPORT':
      return { ...state, exportRequest: action.request };
    case 'ui/SET_AUTO_BACKUP_PROGRESS':
      return state.autoBackupProgress === action.progress ? state : { ...state, autoBackupProgress: action.progress };
    default:
      return state;
  }
}
