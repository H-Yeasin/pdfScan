import { initialUiState, uiReducer, type UiState } from '../../../store/slices/uiSlice';
import { runWithToast } from '../useTask';

// §17 U13: what the store hears from a task, and what the toast and the snack show after.
function store() {
  let state: UiState = initialUiState;
  const actions: { type: string; msg?: string }[] = [];
  const dispatch = jest.fn((action) => {
    actions.push(action);
    if (action.type.startsWith('ui/')) state = uiReducer(state, action);
  });
  return { dispatch, actions, state: () => state };
}

describe('runWithToast (§17 U13)', () => {
  it('shows the toast with its count while it works, then the result snack', async () => {
    const { dispatch, actions, state } = store();
    const seen: (string | undefined)[] = [];
    await runWithToast(
      dispatch,
      'library.merging',
      async (task) => {
        task.progress(3, 5);
        const t = state().task;
        seen.push(t ? `${t.label} ${t.done}/${t.total}` : undefined);
        return 'Lab';
      },
      { done: (name) => `Merged into "${name}"` }
    );
    expect(seen).toEqual(['Merging… 3/5']);
    expect(actions.map((a) => a.type)).toEqual(['ui/TASK_START', 'ui/TASK_PROGRESS', 'ui/TASK_END', 'ui/SHOW_SNACK']);
    expect(state().task).toBeNull();
    expect(state().snack?.msg).toBe('Merged into "Lab"');
  });

  it('leaves the snack to a job that shows its own', async () => {
    const { dispatch, actions } = store();
    await runWithToast(dispatch, 'library.splitting', async () => {
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Split into 3 files', action: 'Undo', onAction: () => undefined });
    });
    expect(actions.filter((a) => a.type === 'ui/SHOW_SNACK').map((a) => a.msg)).toEqual(['Split into 3 files']);
  });

  it('says it stopped after Cancel', async () => {
    const { dispatch, state } = store();
    await runWithToast(
      dispatch,
      'library.compressing',
      async (task) => {
        state().task?.onCancel?.();
        task.throwIfCancelled();
      },
      { cancellable: true }
    );
    expect(state().snack?.msg).toBe('Stopped');
  });

  it('turns an error into a snack', async () => {
    const { dispatch, state } = store();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await runWithToast(dispatch, 'library.merging', async () => {
      throw new Error('boom');
    });
    expect(state().task).toBeNull();
    expect(state().snack?.msg).toBe("Couldn't do that. Please try again.");
    warn.mockRestore();
  });
});
