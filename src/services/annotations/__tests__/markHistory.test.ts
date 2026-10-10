import { initialLibraryState, libraryReducer, type LibraryState } from '../../../store/slices/librarySlice';
import type { Annotation } from '../../../types/models';
import { changeAction, changedPageId, editChange, EMPTY_HISTORY, recordChange, redoChange, undoChange, type MarkChange, type MarkHistory } from '../markHistory';

const note = (id: string, text: string): Annotation => ({ id, documentId: 'd', pageId: `p_${id}`, kind: 'note', color: 'note', data: { x: 1, y: 2 }, text, createdAt: 1, updatedAt: 1 });

// The history as Mark mode uses it: every change goes to the store, and into the history.
function run(state: LibraryState, history: MarkHistory, change: MarkChange) {
  return { state: libraryReducer(state, changeAction(change, 'do')), history: recordChange(history, change) };
}
const texts = (state: LibraryState) => state.annotations.map((a) => a.text);

describe('§18 W15 markHistory', () => {
  it('do, undo and redo an added mark', () => {
    let { state, history } = run(initialLibraryState, EMPTY_HISTORY, { kind: 'added', annotation: note('a', 'one') });
    expect(texts(state)).toEqual(['one']);

    const back = undoChange(history)!;
    state = libraryReducer(state, back.action);
    history = back.history;
    expect(texts(state)).toEqual([]);
    expect(history).toEqual({ undo: [], redo: [{ kind: 'added', annotation: note('a', 'one') }] });

    const again = redoChange(history)!;
    state = libraryReducer(state, again.action);
    expect(texts(state)).toEqual(['one']);
    expect(again.history.redo).toEqual([]);
  });

  it('an erased mark comes back with undo, as it was', () => {
    const first = run(initialLibraryState, EMPTY_HISTORY, { kind: 'added', annotation: note('a', 'one') });
    const erased = run(first.state, first.history, { kind: 'removed', annotation: note('a', 'one') });
    expect(texts(erased.state)).toEqual([]);
    const back = undoChange(erased.history)!;
    expect(libraryReducer(erased.state, back.action).annotations).toEqual([note('a', 'one')]);
  });

  it('an edit goes back to the row before it and forward to the row after', () => {
    const first = run(initialLibraryState, EMPTY_HISTORY, { kind: 'added', annotation: note('a', 'one') });
    const change = editChange(note('a', 'one'), { text: 'two' }, 50);
    expect(change).toMatchObject({ kind: 'edited', after: { text: 'two', updatedAt: 50 }, before: { text: 'one', updatedAt: 1 } });
    const edited = run(first.state, first.history, change);
    expect(texts(edited.state)).toEqual(['two']);
    const back = undoChange(edited.history)!;
    const undone = libraryReducer(edited.state, back.action);
    expect(undone.annotations).toEqual([note('a', 'one')]);
    expect(texts(libraryReducer(undone, redoChange(back.history)!.action))).toEqual(['two']);
  });

  it('a new change after an undo ends what could be redone', () => {
    const first = run(initialLibraryState, EMPTY_HISTORY, { kind: 'added', annotation: note('a', 'one') });
    const back = undoChange(first.history)!;
    const next = recordChange(back.history, { kind: 'added', annotation: note('b', 'two') });
    expect(next.redo).toEqual([]);
    expect(redoChange(next)).toBeNull();
    expect(next.undo).toHaveLength(1);
  });

  it('several changes are undone last first; nothing to undo gives null', () => {
    let step = run(initialLibraryState, EMPTY_HISTORY, { kind: 'added', annotation: note('a', 'one') });
    step = run(step.state, step.history, { kind: 'added', annotation: note('b', 'two') });
    const first = undoChange(step.history)!;
    expect(texts(libraryReducer(step.state, first.action))).toEqual(['one']);
    const second = undoChange(first.history)!;
    expect(undoChange(second.history)).toBeNull();
    expect(redoChange(EMPTY_HISTORY)).toBeNull();
  });

  it('says which page a change is on', () => {
    expect(changedPageId({ kind: 'removed', annotation: note('a', 'x') })).toBe('p_a');
    expect(changedPageId(editChange(note('b', 'x'), { text: 'y' }))).toBe('p_b');
  });
});
