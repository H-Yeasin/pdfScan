import type { FlashMode } from 'expo-camera';
import type { AdjustValues, CaptureMode, EnhanceMode, SessionPage } from '../../types/models';

export type ProcessingStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

export type CaptureState = {
  flash: FlashMode;
  mode: CaptureMode;
  pages: SessionPage[];
  processingStatus: ProcessingStatus;
  errorMessage?: string;
};

export const initialCaptureState: CaptureState = {
  flash: 'auto',
  mode: 'doc',
  pages: [],
  processingStatus: 'idle',
};

export type CaptureAction =
  | { type: 'capture/TOGGLE_FLASH' }
  | { type: 'capture/SET_MODE'; mode: CaptureMode }
  | { type: 'capture/ADD_PAGE'; page: SessionPage }
  | { type: 'capture/REMOVE_PAGE'; id: string }
  | { type: 'capture/REORDER_PAGES'; fromIndex: number; toIndex: number }
  | { type: 'capture/SET_PAGE_ENHANCE'; id: string; enhance: EnhanceMode }
  | { type: 'capture/SET_ALL_PAGES_ENHANCE'; enhance: EnhanceMode }
  | { type: 'capture/SET_PAGE_ADJUST'; id: string; adjust: AdjustValues }
  | { type: 'capture/SET_ALL_PAGES_ADJUST'; adjust: AdjustValues }
  | { type: 'capture/UPDATE_PAGE'; id: string; patch: Partial<SessionPage> }
  | { type: 'capture/CLEAR_PAGES' }
  | { type: 'capture/BULK_ADD_PAGES'; pages: SessionPage[] }
  | { type: 'capture/SET_PROCESSING_STATUS'; status: ProcessingStatus; errorMessage?: string };

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case 'capture/TOGGLE_FLASH':
      return { ...state, flash: state.flash === 'auto' ? 'on' : 'auto' };
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
    case 'capture/SET_ALL_PAGES_ENHANCE':
      return {
        ...state,
        pages: state.pages.map((p) => ({ ...p, enhance: action.enhance })),
      };
    case 'capture/SET_PAGE_ADJUST':
      return {
        ...state,
        pages: state.pages.map((p) => (p.id === action.id ? { ...p, adjust: action.adjust } : p)),
      };
    case 'capture/SET_ALL_PAGES_ADJUST':
      return {
        ...state,
        pages: state.pages.map((p) => ({ ...p, adjust: action.adjust })),
      };
    case 'capture/UPDATE_PAGE':
      return {
        ...state,
        pages: state.pages.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      };
    case 'capture/CLEAR_PAGES':
      return { ...state, pages: [] };
    case 'capture/BULK_ADD_PAGES':
      return { ...state, pages: [...state.pages, ...action.pages] };
    case 'capture/SET_PROCESSING_STATUS':
      return { ...state, processingStatus: action.status, errorMessage: action.errorMessage };
    default:
      return state;
  }
}
