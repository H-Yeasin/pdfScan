import type { Course, LibraryDocument } from '../../types/models';
import { buildSearchHaystack } from '../../services/search/searchService';

export type LibraryTab = 'starred' | 'recent' | 'courses';

// 'failed' means the stored library couldn't be read. Nothing is written back to disk until a
// load succeeds, so a read error can never overwrite the real library with an empty one.
export type LibraryLoadStatus = 'loading' | 'ready' | 'failed';

export type LibraryState = {
  loadStatus: LibraryLoadStatus;
  // Bumped by RETRY_LOAD; useLibraryPersistence reloads whenever it changes.
  loadAttempt: number;
  files: LibraryDocument[];
  courses: Course[];
  // UI-only drill-in state for the Courses tab: null = showing the course list,
  // a course id = showing that course's contents. Not persisted, same category as `tab`.
  activeCourseId: string | null;
  selection: string[];
  selMode: boolean;
  tab: LibraryTab;
  search: string;
  searchOpen: boolean;
  // null = no active DB-backed search result; fall back to the in-memory haystack filter.
  searchResultIds: string[] | null;
};

export const initialLibraryState: LibraryState = {
  loadStatus: 'loading',
  loadAttempt: 0,
  files: [],
  courses: [],
  activeCourseId: null,
  selection: [],
  selMode: false,
  tab: 'recent',
  search: '',
  searchOpen: false,
  searchResultIds: null,
};

export type LibraryAction =
  | { type: 'library/SET_LOAD_STATUS'; status: LibraryLoadStatus }
  | { type: 'library/RETRY_LOAD' }
  | { type: 'library/SET_FILES'; files: LibraryDocument[] }
  | { type: 'library/ADD_FILE'; file: LibraryDocument }
  | { type: 'library/REMOVE_FILES'; ids: string[] }
  | { type: 'library/TOGGLE_STAR'; id: string }
  | { type: 'library/UPDATE_FILE'; id: string; patch: Partial<LibraryDocument> }
  | { type: 'library/REPLACE_FILES'; ids: string[]; files: LibraryDocument[] }
  | { type: 'library/TOGGLE_SELECTION'; id: string }
  | { type: 'library/SET_SEL_MODE'; on: boolean }
  | { type: 'library/CLEAR_SELECTION' }
  | { type: 'library/SET_TAB'; tab: LibraryTab }
  | { type: 'library/SET_SEARCH'; search: string }
  | { type: 'library/TOGGLE_SEARCH_OPEN' }
  | { type: 'library/SET_SEARCH_RESULT_IDS'; ids: string[] | null }
  | { type: 'library/SET_COURSES'; courses: Course[] }
  | { type: 'library/CREATE_COURSE'; id: string; name: string }
  | { type: 'library/RENAME_COURSE'; id: string; name: string }
  | { type: 'library/DELETE_COURSE'; id: string }
  | { type: 'library/ASSIGN_COURSE'; ids: string[]; courseId: string | null }
  | { type: 'library/SET_ACTIVE_COURSE'; id: string | null };

export function libraryReducer(state: LibraryState, action: LibraryAction): LibraryState {
  switch (action.type) {
    case 'library/SET_LOAD_STATUS':
      return { ...state, loadStatus: action.status };
    case 'library/RETRY_LOAD':
      return { ...state, loadStatus: 'loading', loadAttempt: state.loadAttempt + 1 };
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
    case 'library/UPDATE_FILE':
      return {
        ...state,
        files: state.files.map((f) => {
          if (f.id !== action.id) return f;
          const next = { ...f, ...action.patch };
          // Keep the derived search text in step with a rename or new pages.
          if (action.patch.name !== undefined || action.patch.pages !== undefined) {
            next.searchHaystack = buildSearchHaystack(next.name, next.pages);
          }
          return next;
        }),
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
      return { ...state, tab: action.tab, activeCourseId: null };
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
    case 'library/SET_COURSES':
      return { ...state, courses: action.courses };
    case 'library/CREATE_COURSE':
      return {
        ...state,
        courses: [...state.courses, { id: action.id, name: action.name, archived: false, createdAt: Date.now() }],
      };
    case 'library/RENAME_COURSE':
      return {
        ...state,
        courses: state.courses.map((c) => (c.id === action.id ? { ...c, name: action.name } : c)),
      };
    case 'library/DELETE_COURSE':
      // Documents in the course move to Unsorted; their files stay where they are.
      return {
        ...state,
        courses: state.courses.filter((c) => c.id !== action.id),
        files: state.files.map((f) => (f.courseId === action.id ? { ...f, courseId: undefined } : f)),
        activeCourseId: state.activeCourseId === action.id ? null : state.activeCourseId,
      };
    case 'library/ASSIGN_COURSE':
      return {
        ...state,
        files: state.files.map((f) =>
          action.ids.includes(f.id) ? { ...f, courseId: action.courseId ?? undefined } : f
        ),
      };
    case 'library/SET_ACTIVE_COURSE':
      return { ...state, activeCourseId: action.id };
    default:
      return state;
  }
}
