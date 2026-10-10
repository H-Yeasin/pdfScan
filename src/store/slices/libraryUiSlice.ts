import type { LibraryAction } from './librarySlice';

export type LibraryTab = 'starred' | 'recent' | 'courses';

export type IndexingProgress = { documentId: string; done: number; total: number };

// §16 G5: what the Library, Home and a course page show right now, as opposed to what the library
// holds (`library`, which is saved). Nothing here is persisted. It's a slice of its own so that a
// search keystroke, a selection tap or an indexing tick leaves `state.library` as it is: the hooks
// that read the whole library (useLibraryPersistence's diff, the integrity check, indexing,
// reminders) and the screens that only list documents don't run for them.
export type LibraryUiState = {
  // A set, so a row's "am I selected" is O(1). Insertion order is the order they were picked in.
  selection: ReadonlySet<string>;
  selMode: boolean;
  tab: LibraryTab;
  search: string;
  searchOpen: boolean;
  // null = no active DB-backed search result; fall back to the in-memory haystack filter.
  searchResultIds: string[] | null;
  // §7 R1: the imported PDF being indexed in the background, and how far it is.
  indexing: IndexingProgress | null;
  // The course page that's open (Home, the Library's Courses tab, a tapped reminder): a course id,
  // or UNSORTED_COURSE_ID. null = none.
  activeCourseId: string | null;
  // Home's semester switcher. null = follow the current semester by date (homeSelectors).
  homeSemesterId: string | null;
  // The deadline a tapped reminder points at, highlighted on its course page.
  highlightDeadlineId: string | null;
};

const NO_SELECTION: ReadonlySet<string> = new Set();

export const initialLibraryUiState: LibraryUiState = {
  selection: NO_SELECTION,
  selMode: false,
  tab: 'recent',
  search: '',
  searchOpen: false,
  searchResultIds: null,
  indexing: null,
  activeCourseId: null,
  homeSemesterId: null,
  highlightDeadlineId: null,
};

export type LibraryUiAction =
  | { type: 'libraryUi/TOGGLE_SELECTION'; id: string }
  | { type: 'libraryUi/SET_SEL_MODE'; on: boolean }
  | { type: 'libraryUi/CLEAR_SELECTION' }
  // §14 Q5: selects exactly `ids` (the visible list); an empty array selects none but stays selecting.
  | { type: 'libraryUi/SELECT_ALL'; ids: readonly string[] }
  | { type: 'libraryUi/SET_TAB'; tab: LibraryTab }
  | { type: 'libraryUi/SET_SEARCH'; search: string }
  | { type: 'libraryUi/TOGGLE_SEARCH_OPEN' }
  | { type: 'libraryUi/SET_SEARCH_RESULT_IDS'; ids: string[] | null }
  | { type: 'libraryUi/SET_INDEXING'; progress: IndexingProgress | null }
  | { type: 'libraryUi/SET_ACTIVE_COURSE'; id: string | null }
  | { type: 'libraryUi/SET_HOME_SEMESTER'; id: string | null }
  | { type: 'libraryUi/SET_HIGHLIGHT_DEADLINE'; id: string | null };

// The same set when none of `ids` is in it, so the state keeps its identity.
function without(selection: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> {
  if (!ids.some((id) => selection.has(id))) return selection;
  const next = new Set(selection);
  ids.forEach((id) => next.delete(id));
  return next;
}

function sameProgress(a: IndexingProgress | null, b: IndexingProgress | null): boolean {
  if (a === null || b === null) return a === b;
  return a.documentId === b.documentId && a.done === b.done && a.total === b.total;
}

// Every case returns `state` itself when nothing changes: appReducer then keeps the root object,
// and no selector runs (§16 G5).
//
// It also follows the library actions that take away something shown here (a deleted document
// leaves the selection, a deleted course closes its page). The root reducer hands every action to
// every slice.
export function libraryUiReducer(state: LibraryUiState, action: LibraryUiAction | LibraryAction): LibraryUiState {
  switch (action.type) {
    case 'libraryUi/TOGGLE_SELECTION': {
      const selection = new Set(state.selection);
      if (!selection.delete(action.id)) selection.add(action.id);
      return { ...state, selection };
    }
    case 'libraryUi/SET_SEL_MODE': {
      const selection = action.on ? state.selection : NO_SELECTION;
      if (state.selMode === action.on && selection.size === state.selection.size) return state;
      return { ...state, selMode: action.on, selection };
    }
    case 'libraryUi/CLEAR_SELECTION':
      if (!state.selMode && state.selection.size === 0) return state;
      return { ...state, selection: NO_SELECTION, selMode: false };
    case 'libraryUi/SELECT_ALL':
      return { ...state, selection: new Set(action.ids), selMode: true };
    case 'libraryUi/SET_TAB':
      if (state.tab === action.tab && state.activeCourseId === null) return state;
      return { ...state, tab: action.tab, activeCourseId: null };
    case 'libraryUi/SET_SEARCH': {
      const searchResultIds = action.search.trim() ? state.searchResultIds : null;
      if (state.search === action.search && state.searchResultIds === searchResultIds) return state;
      return { ...state, search: action.search, searchResultIds };
    }
    case 'libraryUi/TOGGLE_SEARCH_OPEN':
      return {
        ...state,
        searchOpen: !state.searchOpen,
        search: state.searchOpen ? state.search : '',
        searchResultIds: state.searchOpen ? state.searchResultIds : null,
      };
    case 'libraryUi/SET_SEARCH_RESULT_IDS':
      return state.searchResultIds === action.ids ? state : { ...state, searchResultIds: action.ids };
    case 'libraryUi/SET_INDEXING':
      return sameProgress(state.indexing, action.progress) ? state : { ...state, indexing: action.progress };
    case 'libraryUi/SET_ACTIVE_COURSE':
      return state.activeCourseId === action.id ? state : { ...state, activeCourseId: action.id };
    case 'libraryUi/SET_HOME_SEMESTER':
      return state.homeSemesterId === action.id ? state : { ...state, homeSemesterId: action.id };
    case 'libraryUi/SET_HIGHLIGHT_DEADLINE':
      return state.highlightDeadlineId === action.id ? state : { ...state, highlightDeadlineId: action.id };
    case 'library/REMOVE_FILES':
    case 'library/REPLACE_FILES': {
      const selection = without(state.selection, action.ids);
      return selection === state.selection ? state : { ...state, selection };
    }
    case 'library/DELETE_COURSE':
      return state.activeCourseId === action.id ? { ...state, activeCourseId: null } : state;
    case 'library/DELETE_DEADLINE':
      return state.highlightDeadlineId === action.id ? { ...state, highlightDeadlineId: null } : state;
    default:
      return state;
  }
}
