import { act, create } from 'react-test-renderer';
import {
  AppStateProvider,
  createSelector,
  shallowEqual,
  useAppDispatch,
  useAppSelector,
  useAppSlices,
  useAppState,
} from '../AppStateContext';
import type { AppState } from '../appReducer';
import type { Dispatch } from 'react';
import type { AppAction } from '../appReducer';

function mount() {
  const renders = { snack: 0, library: 0, slices: 0, dispatchOnly: 0, whole: 0 };
  let dispatch: Dispatch<AppAction> | null = null;
  function Snack() {
    useAppSelector((s) => s.ui.snack);
    renders.snack += 1;
    return null;
  }
  function Library() {
    useAppSelector((s) => s.library.files);
    renders.library += 1;
    return null;
  }
  function Slices() {
    useAppSlices('library', 'settings');
    renders.slices += 1;
    return null;
  }
  function DispatchOnly() {
    dispatch = useAppDispatch();
    renders.dispatchOnly += 1;
    return null;
  }
  function Whole() {
    useAppState();
    renders.whole += 1;
    return null;
  }
  act(() => {
    create(
      <AppStateProvider>
        <Snack />
        <Library />
        <Slices />
        <DispatchOnly />
        <Whole />
      </AppStateProvider>
    );
  });
  return { renders, dispatch: (a: AppAction) => act(() => dispatch!(a)) };
}

describe('selector store', () => {
  it('re-renders a component only when the slice it reads changes', () => {
    const { renders, dispatch } = mount();
    const before = { ...renders };

    dispatch({ type: 'ui/SHOW_SNACK', msg: 'Saved' });
    expect(renders.snack).toBe(before.snack + 1);
    expect(renders.library).toBe(before.library);
    expect(renders.slices).toBe(before.slices);
    expect(renders.dispatchOnly).toBe(before.dispatchOnly);
    // The compatibility hook still sees everything.
    expect(renders.whole).toBe(before.whole + 1);

    dispatch({ type: 'library/RETRY_LOAD' });
    expect(renders.snack).toBe(before.snack + 1);
    // `files` didn't change, so the files selector stays put; the library slice did.
    expect(renders.library).toBe(before.library);
    expect(renders.slices).toBe(before.slices + 1);

    // §16 G5: selection, search and the like are another slice; `library` readers don't see them.
    dispatch({ type: 'libraryUi/SET_SEL_MODE', on: true });
    dispatch({ type: 'libraryUi/SET_SEARCH', search: 'a' });
    expect(renders.slices).toBe(before.slices + 1);
    expect(renders.whole).toBe(before.whole + 4);
  });

  it('tells nobody about an action that changes nothing', () => {
    const { renders, dispatch } = mount();
    const before = { ...renders };
    dispatch({ type: 'libraryUi/CLEAR_SELECTION' });
    dispatch({ type: 'ui/CLEAR_SNACK' });
    expect(renders).toEqual(before);
  });
});

describe('shallowEqual', () => {
  it('compares one level deep', () => {
    const files: unknown[] = [];
    expect(shallowEqual({ a: files, b: 1 }, { a: files, b: 1 })).toBe(true);
    expect(shallowEqual({ a: files }, { a: [] })).toBe(false);
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe('createSelector', () => {
  it('recomputes only when an input changes', () => {
    const combine = jest.fn((files: AppState['library']['files']) => files.filter((f) => f.star));
    const starred = createSelector([(s: AppState) => s.library.files], combine);
    const state = { library: { files: [] } } as unknown as AppState;
    const first = starred(state);
    expect(starred({ ...state, ui: {} } as unknown as AppState)).toBe(first);
    expect(combine).toHaveBeenCalledTimes(1);
    starred({ library: { files: [] } } as unknown as AppState);
    expect(combine).toHaveBeenCalledTimes(2);
  });
});
