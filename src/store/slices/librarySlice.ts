import type { LibraryDocument } from '../../types/models';

export type LibraryTab = 'starred' | 'recent' | 'folders';

export type LibraryState = {
  files: LibraryDocument[];
  selection: string[];
  selMode: boolean;
  tab: LibraryTab;
  search: string;
  searchOpen: boolean;
};

export const initialLibraryState: LibraryState = {
  files: [],
  selection: [],
  selMode: false,
  tab: 'recent',
  search: '',
  searchOpen: false,
};

export type LibraryAction =
  | { type: 'library/SET_FILES'; files: LibraryDocument[] }
  | { type: 'library/ADD_FILE'; file: LibraryDocument }
  | { type: 'library/REMOVE_FILES'; ids: string[] }
  | { type: 'library/TOGGLE_STAR'; id: string }
  | { type: 'library/TOGGLE_LOCKED'; id: string }
  | { type: 'library/UPDATE_FILE'; id: string; patch: Partial<LibraryDocument> }
  | { type: 'library/REPLACE_FILES'; ids: string[]; files: LibraryDocument[] }
  | { type: 'library/TOGGLE_SELECTION'; id: string }
  | { type: 'library/SET_SEL_MODE'; on: boolean }
  | { type: 'library/CLEAR_SELECTION' }
  | { type: 'library/SET_TAB'; tab: LibraryTab }
  | { type: 'library/SET_SEARCH'; search: string }
  | { type: 'library/TOGGLE_SEARCH_OPEN' };

export function libraryReducer(state: LibraryState, action: LibraryAction): LibraryState {
  switch (action.type) {
    case 'library/SET_FILES':
      return { ...state, files: action.files };
    case 'library/ADD_FILE':
      return { ...state, files: [action.file, ...state.files] };
    case 'library/REMOVE_FILES':
      return {
        ...state,
        files: state.files.filter((f) => !action.ids.includes(f.id)),
        selection: state.selection.filter((id) => !action.ids.includes(id)),
      };
    case 'library/TOGGLE_STAR':
      return {
        ...state,
        files: state.files.map((f) => (f.id === action.id ? { ...f, star: !f.star } : f)),
      };
    case 'library/TOGGLE_LOCKED':
      return {
        ...state,
        files: state.files.map((f) => (f.id === action.id ? { ...f, locked: !f.locked } : f)),
      };
    case 'library/UPDATE_FILE':
      return {
        ...state,
        files: state.files.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
      };
    case 'library/REPLACE_FILES':
      return {
        ...state,
        files: [...action.files, ...state.files.filter((f) => !action.ids.includes(f.id))],
        selection: state.selection.filter((id) => !action.ids.includes(id)),
      };
    case 'library/TOGGLE_SELECTION': {
      const selected = state.selection.includes(action.id);
      return {
        ...state,
        selection: selected
          ? state.selection.filter((id) => id !== action.id)
          : [...state.selection, action.id],
      };
    }
    case 'library/SET_SEL_MODE':
      return { ...state, selMode: action.on, selection: action.on ? state.selection : [] };
    case 'library/CLEAR_SELECTION':
      return { ...state, selection: [], selMode: false };
    case 'library/SET_TAB':
      return { ...state, tab: action.tab };
    case 'library/SET_SEARCH':
      return { ...state, search: action.search };
    case 'library/TOGGLE_SEARCH_OPEN':
      return { ...state, searchOpen: !state.searchOpen, search: state.searchOpen ? state.search : '' };
    default:
      return state;
  }
}
