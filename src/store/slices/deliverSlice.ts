import type { DocFormat } from '../../types/models';
import type { AcademicConfig, LayoutMode } from '../../services/pdf/pdfService';

export type DeliverState = {
  name: string;
  format: DocFormat;
  quality: number; // 1-5
  more: boolean;
  pw: boolean;
  folderId: string | null;
  // Free-text "Courses" physical routing (see LibraryDocument.courseFolder) - '' means none,
  // same convention as `name`, unlike folderId's null-means-none ID-from-a-list convention.
  courseFolder: string;
  // Android-only: also write a copy to the user's chosen device folder via SAF.
  exportCopy: boolean;
  // Premium academic PDF export options (cover page, border, header/footer). No UI sets this yet;
  // it's plumbed through so buildPdfFromPages can receive it once that UI exists.
  academicConfig: AcademicConfig | null;
  // PDF-only page layout ("Eco-Save" 2-in-1 vs one page per sheet). Only affects buildPdfFromPages;
  // format === 'JPG' export ignores it since JPG saves each page as its own separate image file.
  layoutMode: LayoutMode;
};

export const initialDeliverState: DeliverState = {
  name: '',
  format: 'PDF',
  quality: 3,
  more: false,
  pw: false,
  folderId: null,
  courseFolder: '',
  exportCopy: false,
  academicConfig: null,
  layoutMode: 'standard',
};

export type DeliverAction =
  | { type: 'deliver/SET_NAME'; name: string }
  | { type: 'deliver/SET_FORMAT'; format: DocFormat }
  | { type: 'deliver/SET_QUALITY'; quality: number }
  | { type: 'deliver/TOGGLE_MORE' }
  | { type: 'deliver/TOGGLE_PW' }
  | { type: 'deliver/SET_FOLDER'; folderId: string | null }
  | { type: 'deliver/SET_COURSE_FOLDER'; courseFolder: string }
  | { type: 'deliver/TOGGLE_EXPORT_COPY' }
  | { type: 'deliver/SET_ACADEMIC_CONFIG'; config: AcademicConfig | null }
  | { type: 'deliver/SET_LAYOUT_MODE'; layoutMode: LayoutMode }
  | { type: 'deliver/RESET' };

export function deliverReducer(state: DeliverState, action: DeliverAction): DeliverState {
  switch (action.type) {
    case 'deliver/SET_NAME':
      return { ...state, name: action.name };
    case 'deliver/SET_FORMAT':
      return { ...state, format: action.format };
    case 'deliver/SET_QUALITY':
      return { ...state, quality: action.quality };
    case 'deliver/TOGGLE_MORE':
      return { ...state, more: !state.more };
    case 'deliver/TOGGLE_PW':
      return { ...state, pw: !state.pw };
    case 'deliver/SET_FOLDER':
      return { ...state, folderId: action.folderId };
    case 'deliver/SET_COURSE_FOLDER':
      return { ...state, courseFolder: action.courseFolder };
    case 'deliver/TOGGLE_EXPORT_COPY':
      return { ...state, exportCopy: !state.exportCopy };
    case 'deliver/SET_ACADEMIC_CONFIG':
      return { ...state, academicConfig: action.config };
    case 'deliver/SET_LAYOUT_MODE':
      return { ...state, layoutMode: action.layoutMode };
    case 'deliver/RESET':
      return initialDeliverState;
    default:
      return state;
  }
}
