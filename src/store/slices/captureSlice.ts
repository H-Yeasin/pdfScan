import type { AdjustValues, CaptureMode, EnhanceMode, FilterOptions, ImageStats, SessionPage } from '../../types/models';

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
  // Review's "Apply to all pages": one page's whole look onto every page, as one undo step.
  | { type: 'capture/APPLY_LOOK_TO_ALL'; enhance: EnhanceMode; adjust: AdjustValues | undefined; filterOptions: FilterOptions | undefined }
  // Merged into each page's existing filterOptions; id null means every page (apply to all).
  | { type: 'capture/SET_FILTER_OPTIONS'; id: string | null; options: FilterOptions }
  | { type: 'capture/UPDATE_PAGE'; id: string; patch: Partial<SessionPage> }
  // `uri` is the image the stats were measured from; they're dropped if the page moved on since.
  | { type: 'capture/SET_PAGE_STATS'; id: string; uri: string; stats: ImageStats }
  | { type: 'capture/REPLACE_PAGES'; ids: string[]; page: SessionPage }
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
    case 'capture/APPLY_LOOK_TO_ALL':
      return {
        ...state,
        pages: state.pages.map((p) => ({ ...p, enhance: action.enhance, adjust: action.adjust, filterOptions: action.filterOptions })),
      };
    case 'capture/SET_FILTER_OPTIONS':
      return {
        ...state,
        pages: state.pages.map((p) =>
          action.id === null || p.id === action.id ? { ...p, filterOptions: { ...p.filterOptions, ...action.options } } : p
        ),
      };
    case 'capture/UPDATE_PAGE':
      return {
        ...state,
        pages: state.pages.map((p) => {
          if (p.id !== action.id) return p;
          const next = { ...p, ...action.patch };
          // Stats describe the pixels of `uri`. A crop/rotate/sign that swaps the image without
          // supplying fresh stats must not keep the old ones, or Auto/Color/Gray would stretch the
          // new image with the old histogram.
          if (next.uri !== p.uri && !('stats' in action.patch)) delete next.stats;
          return next;
        }),
      };
    case 'capture/SET_PAGE_STATS':
      return {
        ...state,
        pages: state.pages.map((p) => (p.id === action.id && p.uri === action.uri ? { ...p, stats: action.stats } : p)),
      };
    case 'capture/REPLACE_PAGES': {
      // firstIndex is the position of the FIRST (in array order) matching page, so every page
      // before it is untouched and occupies the same prefix positions after filtering - splicing
      // the merged page in there reproduces exactly where the earlier source page used to sit,
      // regardless of the order the two ids appear in `action.ids`.
      const firstIndex = state.pages.findIndex((p) => action.ids.includes(p.id));
      if (firstIndex === -1) return state;
      const pages = state.pages.filter((p) => !action.ids.includes(p.id));
      pages.splice(firstIndex, 0, action.page);
      return { ...state, pages };
    }
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
