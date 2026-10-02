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
