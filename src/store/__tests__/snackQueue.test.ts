import { initialUiState, uiReducer, type UiState } from '../slices/uiSlice';

const show = (state: UiState, msg: string, action?: string) =>
  uiReducer(state, { type: 'ui/SHOW_SNACK', msg, action, onAction: action ? () => {} : undefined });

describe('snackbar queue (§9 O6)', () => {
  it('replaces a plain message', () => {
    const s = show(show(initialUiState, 'Building…'), 'Submitted');
    expect(s.snack?.msg).toBe('Submitted');
    expect(s.snackQueue).toEqual([]);
  });

  it('keeps a snack with an action, and shows the next one after it', () => {
    let s = show(initialUiState, 'Saved', 'Undo');
    s = show(s, 'Copied to folder');
    expect(s.snack?.msg).toBe('Saved');
    expect(s.snackQueue.map((x) => x.msg)).toEqual(['Copied to folder']);

    s = uiReducer(s, { type: 'ui/CLEAR_SNACK' });
    expect(s.snack?.msg).toBe('Copied to folder');
    s = uiReducer(s, { type: 'ui/CLEAR_SNACK' });
    expect(s.snack).toBeNull();
  });

  it('doesn’t queue a repeat, and keeps only a few waiting', () => {
    let s = show(initialUiState, 'Saved', 'Undo');
    s = show(s, 'Saved', 'Undo');
    expect(s.snackQueue).toEqual([]);
    for (const m of ['a', 'b', 'c', 'd', 'e']) s = show(s, m);
    expect(s.snackQueue.map((x) => x.msg)).toEqual(['c', 'd', 'e']);
  });
});

describe('task toast (§17 U13)', () => {
  const task = { id: 't1', label: 'Merging…' };

  it('counts, and forgets an older task by id', () => {
    let s = uiReducer(initialUiState, { type: 'ui/TASK_START', task });
    s = uiReducer(s, { type: 'ui/TASK_PROGRESS', id: 't1', done: 2, total: 5 });
    expect(s.task).toMatchObject({ done: 2, total: 5 });
    // The same numbers again change nothing.
    expect(uiReducer(s, { type: 'ui/TASK_PROGRESS', id: 't1', done: 2, total: 5 })).toBe(s);
    s = uiReducer(s, { type: 'ui/TASK_START', task: { id: 't2', label: 'Splitting…' } });
    s = uiReducer(s, { type: 'ui/TASK_PROGRESS', id: 't1', done: 3, total: 5 });
    s = uiReducer(s, { type: 'ui/TASK_END', id: 't1' });
    expect(s.task?.id).toBe('t2');
    s = uiReducer(s, { type: 'ui/TASK_END', id: 't2' });
    expect(s.task).toBeNull();
  });

  it('keeps the queue in order under a task: the snacks wait, then show one after another', () => {
    let s = uiReducer(initialUiState, { type: 'ui/TASK_START', task });
    s = show(s, 'Merged', 'Open');
    s = show(s, 'Copied to folder');
    s = uiReducer(s, { type: 'ui/TASK_END', id: 't1' });
    expect(s.snack?.msg).toBe('Merged');
    s = uiReducer(s, { type: 'ui/CLEAR_SNACK' });
    expect(s.snack?.msg).toBe('Copied to folder');
  });
});
