import type { DocFormat, DocType } from '../../types/models';
import type { AcademicConfig, LayoutMode } from '../../services/pdf/pdfService';

export type DeliverState = {
  name: string;
  format: DocFormat;
  quality: number; // 1-5
  more: boolean;
  // Course the saved document is filed under; null means Unsorted. Only used once the student has
  // chosen (coursePicked): until then the course is automatic, the top suggestion
  // (store/useFilingCourse).
  courseId: string | null;
  // True after a pick in Deliver or Capture's "Saving to" chip, or a scan started from a course page.
  coursePicked: boolean;
  // The type the saved document gets. null = the capture mode's default (docTypes.defaultDocTypeFor),
  // so switching mode mid-session still changes it until the student picks one.
  docType: DocType | null;
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
  courseId: null,
  coursePicked: false,
  docType: null,
  exportCopy: false,
  academicConfig: null,
  layoutMode: 'standard',
};

export type DeliverAction =
  | { type: 'deliver/SET_NAME'; name: string }
  | { type: 'deliver/SET_FORMAT'; format: DocFormat }
  | { type: 'deliver/SET_QUALITY'; quality: number }
  | { type: 'deliver/TOGGLE_MORE' }
  | { type: 'deliver/SET_COURSE'; courseId: string | null }
  // Back to the automatic (suggested) course.
  | { type: 'deliver/AUTO_COURSE' }
  | { type: 'deliver/SET_DOC_TYPE'; docType: DocType | null }
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
    case 'deliver/SET_COURSE':
      return { ...state, courseId: action.courseId, coursePicked: true };
    case 'deliver/AUTO_COURSE':
      return { ...state, courseId: null, coursePicked: false };
    case 'deliver/SET_DOC_TYPE':
      return { ...state, docType: action.docType };
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
