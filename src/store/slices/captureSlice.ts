import type { FlashMode } from 'expo-camera';
import type { CaptureMode, EnhanceMode, SessionPage } from '../../types/models';

export type CaptureState = {
  flash: FlashMode;
  auto: boolean;
  mode: CaptureMode;
  pages: SessionPage[];
};

export const initialCaptureState: CaptureState = {
  flash: 'auto',
  auto: true,
  mode: 'doc',
  pages: [],
};

export type CaptureAction =
  | { type: 'capture/TOGGLE_FLASH' }
  | { type: 'capture/TOGGLE_AUTO' }
  | { type: 'capture/SET_MODE'; mode: CaptureMode }
  | { type: 'capture/ADD_PAGE'; page: SessionPage }
  | { type: 'capture/REMOVE_PAGE'; id: string }
  | { type: 'capture/REORDER_PAGES'; fromIndex: number; toIndex: number }
  | { type: 'capture/SET_PAGE_ENHANCE'; id: string; enhance: EnhanceMode }
  | { type: 'capture/UPDATE_PAGE'; id: string; patch: Partial<SessionPage> }
  | { type: 'capture/CLEAR_PAGES' };

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case 'capture/TOGGLE_FLASH':
      return { ...state, flash: state.flash === 'auto' ? 'on' : 'auto' };
    case 'capture/TOGGLE_AUTO':
      return { ...state, auto: !state.auto };
    case 'capture/SET_MODE':
      return { ...state, mode: action.mode };
    case 'capture/ADD_PAGE':
      return { ...state, pages: [...state.pages, action.page] };
    case 'capture/REMOVE_PAGE':
      return { ...state, pages: state.pages.filter((p) => p.id !== action.id) };
    case 'capture/REORDER_PAGES': {
      const pages = state.pages.slice();
      const [moved] = pages.splice(action.fromIndex, 1);
      pages.splice(action.toIndex, 0, moved);
      return { ...state, pages };
    }
    case 'capture/SET_PAGE_ENHANCE':
      return {
        ...state,
        pages: state.pages.map((p) => (p.id === action.id ? { ...p, enhance: action.enhance } : p)),
      };
    case 'capture/UPDATE_PAGE':
      return {
        ...state,
        pages: state.pages.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      };
    case 'capture/CLEAR_PAGES':
      return { ...state, pages: [] };
    default:
      return state;
  }
}
