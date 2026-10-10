import {
  READER_SHEETS_CLOSED,
  chromeLocked,
  readerBackTarget,
  readerSheetsReducer,
  type ReaderSheetsAction,
  type ReaderSheetsState,
} from '../readerSheets';

const run = (actions: ReaderSheetsAction[], from: ReaderSheetsState = READER_SHEETS_CLOSED) => actions.reduce(readerSheetsReducer, from);

describe('§18 W6 reader sheets', () => {
  it('opens one sheet at a time', () => {
    const state = run([
      { type: 'openSheet', sheet: { kind: 'more' } },
      { type: 'openSheet', sheet: { kind: 'reading' } },
    ]);
    expect(state).toEqual({ sheet: { kind: 'reading' }, tool: null });
  });

  it('closes a sheet only by its own kind', () => {
    // The More sheet closes itself and the item picked opens Reading settings: in either order,
    // Reading settings stays.
    const opened = run([
      { type: 'openSheet', sheet: { kind: 'more' } },
      { type: 'openSheet', sheet: { kind: 'reading' } },
      { type: 'closeSheet', kind: 'more' },
    ]);
    expect(opened.sheet).toEqual({ kind: 'reading' });
    const closedFirst = run([
      { type: 'openSheet', sheet: { kind: 'more' } },
      { type: 'closeSheet', kind: 'more' },
      { type: 'openSheet', sheet: { kind: 'reading' } },
    ]);
    expect(closedFirst.sheet).toEqual({ kind: 'reading' });
    expect(run([{ type: 'closeSheet', kind: 'reading' }], opened)).toEqual(READER_SHEETS_CLOSED);
  });

  it('returns the same state when nothing changes', () => {
    expect(readerSheetsReducer(READER_SHEETS_CLOSED, { type: 'closeSheet', kind: 'more' })).toBe(READER_SHEETS_CLOSED);
    expect(readerSheetsReducer(READER_SHEETS_CLOSED, { type: 'closeTool' })).toBe(READER_SHEETS_CLOSED);
    const marking = run([{ type: 'openTool', tool: { kind: 'mark', idx: 2 } }]);
    expect(readerSheetsReducer(marking, { type: 'closeSheet', kind: 'notes' })).toBe(marking);
  });

  it('carries the page being signed from the drawing to the placing, and back for a redraw', () => {
    // §18 W1: the library page is chosen once, when signing starts.
    const drawing = run([{ type: 'openSheet', sheet: { kind: 'signCapture', idx: 3 } }]);
    const placing = run([{ type: 'openTool', tool: { kind: 'signPlace', idx: 3 } }], drawing);
    // A tool starts from the sheet's answer, so the sheet is gone.
    expect(placing).toEqual({ sheet: null, tool: { kind: 'signPlace', idx: 3 } });
    const redraw = run([{ type: 'closeTool' }, { type: 'openSheet', sheet: { kind: 'signCapture', idx: 3 } }], placing);
    expect(redraw).toEqual(drawing);
  });

  it('keeps the tool under a sheet opened over it', () => {
    const state = run([
      { type: 'openTool', tool: { kind: 'mark', idx: 0 } },
      { type: 'openSheet', sheet: { kind: 'notes' } },
    ]);
    expect(state).toEqual({ sheet: { kind: 'notes' }, tool: { kind: 'mark', idx: 0 } });
    expect(run([{ type: 'closeSheet', kind: 'notes' }], state).tool).toEqual({ kind: 'mark', idx: 0 });
  });

  it('gives Back to the sheet, then the tool, then Find, then leaves', () => {
    const both = run([
      { type: 'openTool', tool: { kind: 'mark', idx: 0 } },
      { type: 'openSheet', sheet: { kind: 'notes' } },
    ]);
    expect(readerBackTarget(both, true)).toBe('sheet');
    const toolOnly = run([{ type: 'closeSheet', kind: 'notes' }], both);
    expect(readerBackTarget(toolOnly, true)).toBe('tool');
    const none = run([{ type: 'closeTool' }], toolOnly);
    expect(readerBackTarget(none, true)).toBe('find');
    expect(readerBackTarget(none, false)).toBe('leave');
  });

  it('locks the chrome while a sheet or a tool is open', () => {
    expect(chromeLocked(READER_SHEETS_CLOSED)).toBe(false);
    expect(chromeLocked(run([{ type: 'openSheet', sheet: { kind: 'jump' } }]))).toBe(true);
    expect(chromeLocked(run([{ type: 'openTool', tool: { kind: 'selectText', idx: 1 } }]))).toBe(true);
    expect(chromeLocked(run([{ type: 'openTool', tool: { kind: 'signFlatten', idx: 1 } }, { type: 'closeTool' }]))).toBe(false);
  });
});
