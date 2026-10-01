// §5 T6: the exam-pack tray, like the capture tray: library pages picked from bookmarks, page
// search results and a course's documents, in the order they'll be in the pack. Session only.
export type PackItem = { documentId: string; pageId: string };

export type PackState = {
  items: PackItem[];
  // The course the pack is for (the new document is filed there); null = Unsorted.
  courseId: string | null;
  // Empty: "<course code> exam pack – <date>" (ExamPackScreen fills it in).
  title: string;
  contents: boolean;
  includeAnnotations: boolean;
  pageNumbers: boolean;
};

export const initialPackState: PackState = {
  items: [],
  courseId: null,
  title: '',
  contents: true,
  includeAnnotations: true,
  pageNumbers: true,
};

export type PackAction =
  // Adds pages not already in the pack, at the end. `courseId` sets the pack's course if it has
  // none yet.
  | { type: 'pack/ADD'; items: PackItem[]; courseId?: string | null }
  | { type: 'pack/REMOVE'; index: number }
  | { type: 'pack/MOVE'; from: number; to: number }
  | { type: 'pack/SET_COURSE'; courseId: string | null }
  | { type: 'pack/SET_TITLE'; title: string }
  | { type: 'pack/SET_OPTION'; option: 'contents' | 'includeAnnotations' | 'pageNumbers'; value: boolean }
  | { type: 'pack/CLEAR' };

const same = (a: PackItem, b: PackItem) => a.documentId === b.documentId && a.pageId === b.pageId;

export function packReducer(state: PackState, action: PackAction): PackState {
  switch (action.type) {
    case 'pack/ADD': {
      const fresh = action.items.filter((item, i) => !state.items.some((x) => same(x, item)) && action.items.findIndex((x) => same(x, item)) === i);
      const courseId = state.items.length === 0 && action.courseId !== undefined ? action.courseId : state.courseId;
      return { ...state, items: [...state.items, ...fresh], courseId };
    }
    case 'pack/REMOVE':
      return { ...state, items: state.items.filter((_, i) => i !== action.index) };
    case 'pack/MOVE': {
      if (action.to < 0 || action.to >= state.items.length) return state;
      const items = [...state.items];
      const [moved] = items.splice(action.from, 1);
      items.splice(action.to, 0, moved);
      return { ...state, items };
    }
    case 'pack/SET_COURSE':
      return { ...state, courseId: action.courseId };
    case 'pack/SET_TITLE':
      return { ...state, title: action.title };
    case 'pack/SET_OPTION':
      return { ...state, [action.option]: action.value };
    case 'pack/CLEAR':
      return initialPackState;
    default:
      return state;
  }
}
