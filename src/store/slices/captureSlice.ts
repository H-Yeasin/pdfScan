import type { AdjustValues, CaptureMode, EnhanceMode, SessionPage } from '../../types/models';

export type ProcessingStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

export type CaptureState = {
  mode: CaptureMode;
  pages: SessionPage[];
  processingStatus: ProcessingStatus;
  errorMessage?: string;
  // Set by ReviewScreen's "Retake" action right before navigating to Capture. The next
  // BULK_ADD_PAGES splices its pages in at this page's position (replacing it) instead of
  // appending, then clears the flag. Every other entry point into Capture must clear it too, so a
  // cancelled retake can't leak into an unrelated later scan and silently replace the wrong page.
  retakeTargetId: string | null;
};

export const initialCaptureState: CaptureState = {
  mode: 'doc',
  pages: [],
  processingStatus: 'idle',
  retakeTargetId: null,
};

export type CaptureAction =
  | { type: 'capture/SET_MODE'; mode: CaptureMode }
  | { type: 'capture/REMOVE_PAGE'; id: string }
  | { type: 'capture/SET_RETAKE_TARGET'; id: string | null }
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
    case 'capture/SET_MODE':
      return { ...state, mode: action.mode };
    case 'capture/SET_RETAKE_TARGET':
      return { ...state, retakeTargetId: action.id };
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
    case 'capture/BULK_ADD_PAGES': {
      const targetId = state.retakeTargetId;
      const targetIndex = targetId ? state.pages.findIndex((p) => p.id === targetId) : -1;
      if (targetIndex !== -1) {
        const pages = state.pages.slice();
        pages.splice(targetIndex, 1, ...action.pages);
        return { ...state, pages, retakeTargetId: null };
      }
      return { ...state, pages: [...state.pages, ...action.pages], retakeTargetId: null };
    }
    case 'capture/SET_PROCESSING_STATUS':
      return { ...state, processingStatus: action.status, errorMessage: action.errorMessage };
    default:
      return state;
  }
}
