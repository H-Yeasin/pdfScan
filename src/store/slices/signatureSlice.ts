import type { SavedSignature } from '../../services/signature/savedSignatureStorage';

export type SignatureState = {
  saved: SavedSignature | null;
};

export const initialSignatureState: SignatureState = {
  saved: null,
};

export type SignatureAction =
  | { type: 'signature/SET_SAVED'; saved: SavedSignature }
  | { type: 'signature/CLEAR_SAVED' };

export function signatureReducer(state: SignatureState, action: SignatureAction): SignatureState {
  switch (action.type) {
    case 'signature/SET_SAVED':
      return { ...state, saved: action.saved };
    case 'signature/CLEAR_SAVED':
      return { ...state, saved: null };
    default:
      return state;
  }
}
