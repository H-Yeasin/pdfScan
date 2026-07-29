import type { LibraryDocument, LibraryFolder } from '../../types/models';

export type LibraryTab = 'starred' | 'recent' | 'folders';

export type LibraryState = {
  files: LibraryDocument[];
  folders: LibraryFolder[];
  // UI-only drill-in state for the Folders tab: null = showing the folder list,
  // a folder id = showing that folder's contents. Not persisted, same category as `tab`.
  activeFolderId: string | null;
  selection: string[];
  selMode: boolean;
  tab: LibraryTab;
  search: string;
  searchOpen: boolean;
  // null = no active DB-backed search result; fall back to the in-memory haystack filter.
  searchResultIds: string[] | null;
};

export const initialLibraryState: LibraryState = {
  files: [],
  folders: [],
  activeFolderId: null,
  selection: [],
  selMode: false,
  tab: 'recent',
  search: '',
  searchOpen: false,
  searchResultIds: null,
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
  | { type: 'library/TOGGLE_SEARCH_OPEN' }
  | { type: 'library/SET_SEARCH_RESULT_IDS'; ids: string[] | null }
  | { type: 'library/SET_FOLDERS'; folders: LibraryFolder[] }
  | { type: 'library/CREATE_FOLDER'; id: string; name: string }
  | { type: 'library/RENAME_FOLDER'; id: string; name: string }
  | { type: 'library/DELETE_FOLDER'; id: string }
  | { type: 'library/ASSIGN_FOLDER'; ids: string[]; folderId: string | null }
  | { type: 'library/SET_ACTIVE_FOLDER'; id: string | null };

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
      return { ...state, tab: action.tab, activeFolderId: null };
    case 'library/SET_SEARCH':
      return { ...state, search: action.search, searchResultIds: action.search.trim() ? state.searchResultIds : null };
    case 'library/TOGGLE_SEARCH_OPEN':
      return {
        ...state,
        searchOpen: !state.searchOpen,
        search: state.searchOpen ? state.search : '',
        searchResultIds: state.searchOpen ? state.searchResultIds : null,
      };
    case 'library/SET_SEARCH_RESULT_IDS':
      return { ...state, searchResultIds: action.ids };
    case 'library/SET_FOLDERS':
      return { ...state, folders: action.folders };
    case 'library/CREATE_FOLDER':
      return { ...state, folders: [...state.folders, { id: action.id, name: action.name, createdAt: Date.now() }] };
    case 'library/RENAME_FOLDER':
      return {
        ...state,
        folders: state.folders.map((f) => (f.id === action.id ? { ...f, name: action.name } : f)),
      };
    case 'library/DELETE_FOLDER':
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.id),
        files: state.files.map((f) => (f.folderId === action.id ? { ...f, folderId: undefined } : f)),
        activeFolderId: state.activeFolderId === action.id ? null : state.activeFolderId,
      };
    case 'library/ASSIGN_FOLDER':
      return {
        ...state,
        files: state.files.map((f) =>
          action.ids.includes(f.id) ? { ...f, folderId: action.folderId ?? undefined } : f
        ),
      };
    case 'library/SET_ACTIVE_FOLDER':
      return { ...state, activeFolderId: action.id };
    default:
      return state;
  }
}
