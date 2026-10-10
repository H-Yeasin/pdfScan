// §18 W6: what the Reader has open over the page, as one state. It used to be twelve booleans in
// ReaderScreen, OR'd together to know whether anything covered the bars, and nothing stopped two
// of them from being true at once. Pure, so the rules (one sheet at a time, what Back closes
// first) are tested without rendering the Reader.

// A sheet: a panel or prompt over the page that the student answers or dismisses.
// - 'more': the More sheet; 'reading': reading settings; 'type': the document type picker;
// - 'jump': "Go to page"; 'pages': the thumbnails strip; 'submissions': the submission history;
// - 'bookmarks', 'notes': their lists; 'label': the bookmark label prompt;
// - 'signCapture': drawing a signature, for library page `idx` (§18 W1).
// W23 adds 'rename' and 'move'.
export type ReaderSheet =
  | { kind: 'more' | 'reading' | 'type' | 'jump' | 'pages' | 'submissions' | 'bookmarks' | 'notes' | 'label' }
  | { kind: 'signCapture'; idx: number };

export type ReaderSheetKind = ReaderSheet['kind'];

// A tool: a mode that takes over the page until it is left, each on library page `idx`.
// 'mark': Mark mode (§12 D3); 'selectText': Select text (§5 T3); 'signPlace': placing the
// signature on a PDF page; 'signFlatten': signing a JPG-format document's page master.
export type ReaderOpenTool = { kind: 'mark' | 'selectText' | 'signPlace' | 'signFlatten'; idx: number };

export type ReaderSheetsState = { sheet: ReaderSheet | null; tool: ReaderOpenTool | null };

export const READER_SHEETS_CLOSED: ReaderSheetsState = { sheet: null, tool: null };

export type ReaderSheetsAction =
  // Replaces the sheet that was open: there is one at a time.
  | { type: 'openSheet'; sheet: ReaderSheet }
  // Closes the sheet only if it is this one. A sheet closes itself and runs what was picked,
  // which may open another sheet (More → Reading settings): whichever order the two arrive in,
  // the close must not take the new sheet with it.
  | { type: 'closeSheet'; kind: ReaderSheetKind }
  // A tool starts from a sheet's choice (the signature drawn, then placed), so the sheet goes.
  | { type: 'openTool'; tool: ReaderOpenTool }
  | { type: 'closeTool' };

export function readerSheetsReducer(state: ReaderSheetsState, action: ReaderSheetsAction): ReaderSheetsState {
  switch (action.type) {
    case 'openSheet':
      return { ...state, sheet: action.sheet };
    case 'closeSheet':
      return state.sheet?.kind === action.kind ? { ...state, sheet: null } : state;
    case 'openTool':
      return { sheet: null, tool: action.tool };
    case 'closeTool':
      return state.tool ? { ...state, tool: null } : state;
  }
}

// What an Android Back press closes: the sheet, then the tool, then Find, and only then does it
// leave the Reader. The sheets are RN Modals and Mark mode has its own listener, so they take the
// press themselves; the Reader uses this to know when the press is Find's.
export type ReaderBackTarget = 'sheet' | 'tool' | 'find' | 'leave';

export function readerBackTarget(state: ReaderSheetsState, findOpen: boolean): ReaderBackTarget {
  if (state.sheet) return 'sheet';
  if (state.tool) return 'tool';
  return findOpen ? 'find' : 'leave';
}

// Something covers the bars, so nothing may point at them (§9 O3's bookmark hint waits).
export function chromeLocked(state: ReaderSheetsState): boolean {
  return state.sheet !== null || state.tool !== null;
}
