import type { DocFormat, DocType } from '../../types/models';
import type { AcademicConfig, LayoutMode } from '../../services/pdf/pdfService';
import { defaultPageSize, type PageSizeId } from '../../services/pdf/pageSize';
import { presetAcademicConfig, type SubmitPreset } from '../../services/submit/preset';

export type DeliverState = {
  name: string;
  // False while `name` is the one suggested from the naming template, which then follows the
  // course and type; true once the student types, after which the name is left alone.
  nameEdited: boolean;
  format: DocFormat;
  quality: number; // 1-5
  // §4 size target: the PDF is built to fit under this many bytes (services/submit/sizeTarget.ts)
  // and the quality slider is hidden. null = "Original", the slider decides.
  sizeLimitBytes: number | null;
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
  // Paper size of every PDF page (the 2-in-1 layout turns it landscape). Starts at the region's
  // usual paper; S6 makes it part of the course's preset.
  pageSize: PageSizeId;
  // §4 S6: whose preset the options above came from. undefined until one is applied (each new
  // session), null for Unsorted. Deliver re-applies when the filing course changes.
  presetCourseId?: string | null;
  // "Remember for CSE 101": option changes are saved to the course's preset.
  rememberPreset: boolean;
  // The course preset's file-name template, if it has its own (else settings.nameTemplate).
  nameTemplate?: string;
};

export const initialDeliverState: DeliverState = {
  name: '',
  nameEdited: false,
  format: 'PDF',
  quality: 3,
  sizeLimitBytes: null,
  more: false,
  courseId: null,
  coursePicked: false,
  docType: null,
  exportCopy: false,
  academicConfig: null,
  layoutMode: 'standard',
  pageSize: defaultPageSize(),
  rememberPreset: true,
};

export type DeliverAction =
  // Typed by the student.
  | { type: 'deliver/SET_NAME'; name: string }
  // Suggested from the naming template (submit/naming.suggestName).
  | { type: 'deliver/SET_AUTO_NAME'; name: string }
  | { type: 'deliver/SET_FORMAT'; format: DocFormat }
  | { type: 'deliver/SET_QUALITY'; quality: number }
  | { type: 'deliver/SET_SIZE_LIMIT'; bytes: number | null }
  | { type: 'deliver/TOGGLE_MORE' }
  | { type: 'deliver/SET_COURSE'; courseId: string | null }
  // Back to the automatic (suggested) course.
  | { type: 'deliver/AUTO_COURSE' }
  | { type: 'deliver/SET_DOC_TYPE'; docType: DocType | null }
  | { type: 'deliver/TOGGLE_EXPORT_COPY' }
  | { type: 'deliver/SET_ACADEMIC_CONFIG'; config: AcademicConfig | null }
  | { type: 'deliver/SET_LAYOUT_MODE'; layoutMode: LayoutMode }
  | { type: 'deliver/SET_PAGE_SIZE'; pageSize: PageSizeId }
  // The filing course's preset (or the default) becomes the options.
  | { type: 'deliver/APPLY_PRESET'; courseId: string | null; preset: SubmitPreset }
  | { type: 'deliver/SET_REMEMBER_PRESET'; remember: boolean }
  | { type: 'deliver/SET_NAME_TEMPLATE'; template: string | undefined }
  | { type: 'deliver/RESET' };

export function deliverReducer(state: DeliverState, action: DeliverAction): DeliverState {
  switch (action.type) {
    case 'deliver/SET_NAME':
      return { ...state, name: action.name, nameEdited: true };
    case 'deliver/SET_AUTO_NAME':
      return state.nameEdited ? state : { ...state, name: action.name };
    case 'deliver/SET_FORMAT':
      return { ...state, format: action.format };
    case 'deliver/SET_QUALITY':
      return { ...state, quality: action.quality };
    case 'deliver/SET_SIZE_LIMIT':
      return { ...state, sizeLimitBytes: action.bytes };
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
    case 'deliver/APPLY_PRESET': {
      // A header and a photo cover belong to this document, not the course, so they survive.
      const keep = state.academicConfig;
      const fromPreset = presetAcademicConfig(action.preset);
      const photoCover = keep?.coverPage?.mode === 'imported_image' ? keep.coverPage : undefined;
      const academicConfig =
        fromPreset || keep?.headerText || photoCover
          ? {
              enableBorder: fromPreset?.enableBorder ?? false,
              footerText: fromPreset?.footerText,
              headerText: keep?.headerText,
              coverPage: photoCover ?? fromPreset?.coverPage,
            }
          : null;
      return {
        ...state,
        presetCourseId: action.courseId,
        sizeLimitBytes: action.preset.sizeLimitBytes,
        pageSize: action.preset.pageSize,
        layoutMode: action.preset.layout,
        nameTemplate: action.preset.nameTemplate,
        academicConfig,
      };
    }
    case 'deliver/SET_REMEMBER_PRESET':
      return { ...state, rememberPreset: action.remember };
    case 'deliver/SET_NAME_TEMPLATE':
      return { ...state, nameTemplate: action.template?.trim() ? action.template : undefined };
    case 'deliver/SET_PAGE_SIZE':
      return { ...state, pageSize: action.pageSize };
    case 'deliver/RESET':
      return initialDeliverState;
    default:
      return state;
  }
}
