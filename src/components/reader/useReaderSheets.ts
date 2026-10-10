import { useMemo, useReducer } from 'react';
import {
  READER_SHEETS_CLOSED,
  readerSheetsReducer,
  type ReaderOpenTool,
  type ReaderSheet,
  type ReaderSheetKind,
} from '../../services/reader/readerSheets';

// §18 W6: the Reader's sheets and tools (services/reader/readerSheets). The functions keep their
// identity, so a callback that only opens or closes something doesn't change with the state.
export function useReaderSheets() {
  const [state, dispatch] = useReducer(readerSheetsReducer, READER_SHEETS_CLOSED);
  const actions = useMemo(
    () => ({
      open: (sheet: ReaderSheet) => dispatch({ type: 'openSheet', sheet }),
      close: (kind: ReaderSheetKind) => dispatch({ type: 'closeSheet', kind }),
      openTool: (tool: ReaderOpenTool) => dispatch({ type: 'openTool', tool }),
      closeTool: () => dispatch({ type: 'closeTool' }),
    }),
    []
  );
  return useMemo(() => ({ ...state, state, ...actions }), [state, actions]);
}

export type ReaderSheets = ReturnType<typeof useReaderSheets>;
