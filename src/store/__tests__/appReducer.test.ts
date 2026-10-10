import { appReducer, type AppAction, type AppState } from '../appReducer';
import { initialAppState } from '../initialState';
import { makeDoc } from '../../test/fixtures';

// §16 G5: the store only tells its subscribers when the root object changes (AppStateContext's
// `next === state`), so an action that changes nothing has to give the same object back.
describe('appReducer identity', () => {
  it('returns the same state for an action no slice handles', () => {
    expect(appReducer(initialAppState, { type: 'nothing/HERE' } as unknown as AppAction)).toBe(initialAppState);
  });

  it('returns the same state for an action that changes nothing', () => {
    const noOps: AppAction[] = [
      { type: 'ui/CLEAR_SNACK' },
      { type: 'ui/SET_AUTO_BACKUP_PROGRESS', progress: null },
      { type: 'libraryUi/CLEAR_SELECTION' },
      { type: 'libraryUi/SET_INDEXING', progress: null },
      { type: 'libraryUi/SET_SEARCH', search: '' },
      { type: 'review/UNDO' },
    ];
    for (const action of noOps) expect(appReducer(initialAppState, action)).toBe(initialAppState);
  });

  it('changes only the slice an action touches', () => {
    const typed = appReducer(initialAppState, { type: 'libraryUi/SET_SEARCH', search: 'a' });
    expect(typed).not.toBe(initialAppState);
    expect(typed.libraryUi.search).toBe('a');
    const others = (Object.keys(typed) as (keyof AppState)[]).filter((key) => key !== 'libraryUi');
    for (const key of others) expect(typed[key]).toBe(initialAppState[key]);
  });

  it('a library action can reach the UI slice too', () => {
    const doc = makeDoc({ id: 'a' });
    const selected = [
      { type: 'library/SET_FILES', files: [doc] },
      { type: 'libraryUi/SELECT_ALL', ids: ['a'] },
    ].reduce((s, a) => appReducer(s, a as AppAction), initialAppState);
    const removed = appReducer(selected, { type: 'library/REMOVE_FILES', ids: ['a'] });
    expect(removed.library.files).toEqual([]);
    expect(removed.libraryUi.selection.size).toBe(0);
  });
});
