import { initialLibraryUiState, libraryUiReducer } from '../slices/libraryUiSlice';
import type { LibraryUiAction, LibraryUiState } from '../slices/libraryUiSlice';
import type { LibraryAction } from '../slices/librarySlice';

function run(...actions: (LibraryUiAction | LibraryAction)[]): LibraryUiState {
  return actions.reduce(libraryUiReducer, initialLibraryUiState);
}

// §16 G5: what the Library shows (as opposed to what it holds, librarySlice).
describe('libraryUiSlice selection', () => {
  it('toggles documents in and out, in the order they were picked', () => {
    const state = run(
      { type: 'libraryUi/SET_SEL_MODE', on: true },
      { type: 'libraryUi/TOGGLE_SELECTION', id: 'b' },
      { type: 'libraryUi/TOGGLE_SELECTION', id: 'a' },
      { type: 'libraryUi/TOGGLE_SELECTION', id: 'c' },
      { type: 'libraryUi/TOGGLE_SELECTION', id: 'a' }
    );
    expect([...state.selection]).toEqual(['b', 'c']);
    expect(state.selection.has('b')).toBe(true);
    expect(state.selection.has('a')).toBe(false);
    expect(state.selMode).toBe(true);
  });

  // §14 Q5.
  it('SELECT_ALL selects exactly the given ids and turns selection mode on', () => {
    const state = run({ type: 'libraryUi/TOGGLE_SELECTION', id: 'c' }, { type: 'libraryUi/SELECT_ALL', ids: ['a', 'b'] });
    expect([...state.selection]).toEqual(['a', 'b']);
    expect(state.selMode).toBe(true);
  });

  it('SELECT_ALL with no ids selects none but keeps selecting', () => {
    const state = run({ type: 'libraryUi/SELECT_ALL', ids: ['a', 'b'] }, { type: 'libraryUi/SELECT_ALL', ids: [] });
    expect(state.selection.size).toBe(0);
    expect(state.selMode).toBe(true);
  });

  it('leaving selection mode clears the selection', () => {
    const selected = run({ type: 'libraryUi/SELECT_ALL', ids: ['a', 'b'] });
    expect(libraryUiReducer(selected, { type: 'libraryUi/SET_SEL_MODE', on: false })).toMatchObject({ selMode: false, selection: new Set() });
    expect(libraryUiReducer(selected, { type: 'libraryUi/CLEAR_SELECTION' })).toMatchObject({ selMode: false, selection: new Set() });
  });

  it('a removed or replaced document leaves the selection', () => {
    const selected = run({ type: 'libraryUi/SELECT_ALL', ids: ['a', 'b', 'c'] });
    const removed = libraryUiReducer(selected, { type: 'library/REMOVE_FILES', ids: ['a', 'c'] });
    expect([...removed.selection]).toEqual(['b']);
    // Still selecting: the screen that deleted them clears the mode itself.
    expect(removed.selMode).toBe(true);
    const merged = libraryUiReducer(selected, { type: 'library/REPLACE_FILES', ids: ['a', 'b'], files: [] });
    expect([...merged.selection]).toEqual(['c']);
  });
});

describe('libraryUiSlice search and tabs', () => {
  it('opening search starts empty; closing keeps what was typed until it opens again', () => {
    const typed = run(
      { type: 'libraryUi/TOGGLE_SEARCH_OPEN' },
      { type: 'libraryUi/SET_SEARCH', search: 'algebra' },
      { type: 'libraryUi/SET_SEARCH_RESULT_IDS', ids: ['a'] }
    );
    expect(typed).toMatchObject({ searchOpen: true, search: 'algebra', searchResultIds: ['a'] });
    const closed = libraryUiReducer(typed, { type: 'libraryUi/TOGGLE_SEARCH_OPEN' });
    expect(closed).toMatchObject({ searchOpen: false, search: 'algebra' });
    expect(libraryUiReducer(closed, { type: 'libraryUi/TOGGLE_SEARCH_OPEN' })).toMatchObject({ searchOpen: true, search: '', searchResultIds: null });
  });

  it('clearing the query drops the database results', () => {
    const state = run(
      { type: 'libraryUi/SET_SEARCH', search: 'x' },
      { type: 'libraryUi/SET_SEARCH_RESULT_IDS', ids: ['a'] },
      { type: 'libraryUi/SET_SEARCH', search: '  ' }
    );
    expect(state.searchResultIds).toBeNull();
  });

  it('changing tab closes the open course', () => {
    const state = run({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'c1' }, { type: 'libraryUi/SET_TAB', tab: 'courses' });
    expect(state).toMatchObject({ tab: 'courses', activeCourseId: null });
  });

  it('a deleted course or deadline is no longer the one shown', () => {
    const open = run({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'c1' }, { type: 'libraryUi/SET_HIGHLIGHT_DEADLINE', id: 'd1' });
    expect(libraryUiReducer(open, { type: 'library/DELETE_COURSE', id: 'c1' }).activeCourseId).toBeNull();
    expect(libraryUiReducer(open, { type: 'library/DELETE_COURSE', id: 'other' })).toBe(open);
    expect(libraryUiReducer(open, { type: 'library/DELETE_DEADLINE', id: 'd1' }).highlightDeadlineId).toBeNull();
    expect(libraryUiReducer(open, { type: 'library/DELETE_DEADLINE', id: 'other' })).toBe(open);
  });
});

describe('libraryUiSlice identity', () => {
  it('returns the same state when nothing changes', () => {
    const state = run(
      { type: 'libraryUi/SELECT_ALL', ids: ['a'] },
      { type: 'libraryUi/SET_SEARCH', search: 'x' },
      { type: 'libraryUi/SET_INDEXING', progress: { documentId: 'd', done: 2, total: 5 } },
      { type: 'libraryUi/SET_HOME_SEMESTER', id: 's1' }
    );
    const same: (LibraryUiAction | LibraryAction)[] = [
      { type: 'libraryUi/SET_SEL_MODE', on: true },
      { type: 'libraryUi/SET_TAB', tab: 'recent' },
      { type: 'libraryUi/SET_SEARCH', search: 'x' },
      { type: 'libraryUi/SET_SEARCH_RESULT_IDS', ids: null },
      { type: 'libraryUi/SET_INDEXING', progress: { documentId: 'd', done: 2, total: 5 } },
      { type: 'libraryUi/SET_ACTIVE_COURSE', id: null },
      { type: 'libraryUi/SET_HOME_SEMESTER', id: 's1' },
      { type: 'libraryUi/SET_HIGHLIGHT_DEADLINE', id: null },
      { type: 'library/REMOVE_FILES', ids: ['zzz'] },
      { type: 'library/TOGGLE_STAR', id: 'a' },
    ];
    for (const action of same) expect(libraryUiReducer(state, action)).toBe(state);
    expect(libraryUiReducer(initialLibraryUiState, { type: 'libraryUi/CLEAR_SELECTION' })).toBe(initialLibraryUiState);
  });
});
