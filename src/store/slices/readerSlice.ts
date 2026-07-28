export type ReaderState = {
  readerId: string | null;
  night: boolean;
};

export const initialReaderState: ReaderState = {
  readerId: null,
  night: false,
};

export type ReaderAction =
  | { type: 'reader/SET_READER_ID'; id: string }
  | { type: 'reader/TOGGLE_NIGHT' };

export function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case 'reader/SET_READER_ID':
      return { ...state, readerId: action.id };
    case 'reader/TOGGLE_NIGHT':
      return { ...state, night: !state.night };
    default:
      return state;
  }
}
