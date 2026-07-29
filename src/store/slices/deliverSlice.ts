import type { DocFormat } from '../../types/models';

export type DeliverState = {
  name: string;
  format: DocFormat;
  quality: number; // 1-5
  more: boolean;
  pw: boolean;
  folderId: string | null;
  // Android-only: also write a copy to the user's chosen device folder via SAF.
  exportCopy: boolean;
};

export const initialDeliverState: DeliverState = {
  name: '',
  format: 'PDF',
  quality: 3,
  more: false,
  pw: false,
  folderId: null,
  exportCopy: false,
};

export type DeliverAction =
  | { type: 'deliver/SET_NAME'; name: string }
  | { type: 'deliver/SET_FORMAT'; format: DocFormat }
  | { type: 'deliver/SET_QUALITY'; quality: number }
  | { type: 'deliver/TOGGLE_MORE' }
  | { type: 'deliver/TOGGLE_PW' }
  | { type: 'deliver/SET_FOLDER'; folderId: string | null }
  | { type: 'deliver/TOGGLE_EXPORT_COPY' }
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
    case 'deliver/TOGGLE_EXPORT_COPY':
      return { ...state, exportCopy: !state.exportCopy };
    case 'deliver/RESET':
      return initialDeliverState;
    default:
      return state;
  }
}
