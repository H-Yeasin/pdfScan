import { DEFAULT_TOOL_OPTIONS, IDLE, toolFlowReducer, type FlowEvent, type FlowState } from '../toolFlow';

jest.mock('../../pdf/pdfNative', () => ({ isPdfNativeAvailable: () => true }));

function play(events: FlowEvent[], from: FlowState = IDLE): FlowState {
  return events.reduce(toolFlowReducer, from);
}

describe('toolFlowReducer', () => {
  it('goes pick → options → run → result for a tool with options', () => {
    let state = play([{ type: 'open', tool: 'merge' }]);
    expect(state).toEqual({ step: 'pick', tool: 'merge' });
    state = toolFlowReducer(state, { type: 'picked', docIds: ['a', 'b'] });
    expect(state).toEqual({ step: 'options', tool: 'merge', docIds: ['a', 'b'], options: DEFAULT_TOOL_OPTIONS });
    state = toolFlowReducer(state, { type: 'setOptions', options: { keepOriginals: false } });
    state = toolFlowReducer(state, { type: 'confirm' });
    expect(state).toEqual({ step: 'run', tool: 'merge', docIds: ['a', 'b'], options: { ...DEFAULT_TOOL_OPTIONS, keepOriginals: false } });
    state = toolFlowReducer(state, { type: 'done', result: { tool: 'merge', docIds: ['m'] } });
    expect(state).toEqual({ step: 'result', result: { tool: 'merge', docIds: ['m'] } });
  });

  it('keeps the originals by default', () => {
    expect(DEFAULT_TOOL_OPTIONS.keepOriginals).toBe(true);
  });

  it('skips options for a tool without any', () => {
    const state = play([
      { type: 'open', tool: 'toWord' },
      { type: 'picked', docIds: ['a'] },
    ]);
    expect(state.step).toBe('run');
  });

  it('runs a launch tool at once, with nothing to pick', () => {
    expect(play([{ type: 'open', tool: 'scan' }])).toEqual({ step: 'run', tool: 'scan', docIds: [], options: DEFAULT_TOOL_OPTIONS });
  });

  it('refuses a pick outside min and max', () => {
    const picking = play([{ type: 'open', tool: 'merge' }]);
    expect(toolFlowReducer(picking, { type: 'picked', docIds: ['a'] })).toBe(picking);
    const split = play([{ type: 'open', tool: 'split' }]);
    expect(toolFlowReducer(split, { type: 'picked', docIds: ['a', 'b'] })).toBe(split);
  });

  it('goes back from options to pick', () => {
    const state = play([{ type: 'open', tool: 'compress' }, { type: 'picked', docIds: ['a'] }, { type: 'back' }]);
    expect(state).toEqual({ step: 'pick', tool: 'compress' });
  });

  it('cancels from pick, options and result, never half-way through a run', () => {
    expect(play([{ type: 'open', tool: 'merge' }, { type: 'cancel' }])).toBe(IDLE);
    expect(play([{ type: 'open', tool: 'compress' }, { type: 'picked', docIds: ['a'] }, { type: 'cancel' }])).toBe(IDLE);
    const running = play([{ type: 'open', tool: 'compress' }, { type: 'picked', docIds: ['a'] }, { type: 'confirm' }]);
    expect(toolFlowReducer(running, { type: 'cancel' })).toBe(running);
    expect(toolFlowReducer(running, { type: 'open', tool: 'merge' })).toBe(running);
    const result = toolFlowReducer(running, { type: 'done', result: { tool: 'compress', docIds: ['a'] } });
    expect(toolFlowReducer(result, { type: 'cancel' })).toBe(IDLE);
  });

  it('ends without a result for a hand-off and after a failure', () => {
    const running = play([{ type: 'open', tool: 'sign' }, { type: 'picked', docIds: ['a'] }]);
    expect(toolFlowReducer(running, { type: 'done', result: null })).toBe(IDLE);
    expect(toolFlowReducer(running, { type: 'failed' })).toBe(IDLE);
  });

  it('shows a gated tool’s result when it reports back, but not over another tool', () => {
    const result = { tool: 'toWord' as const, docIds: ['w'] };
    expect(toolFlowReducer(IDLE, { type: 'showResult', result })).toEqual({ step: 'result', result });
    const picking = play([{ type: 'open', tool: 'merge' }]);
    expect(toolFlowReducer(picking, { type: 'showResult', result })).toBe(picking);
  });
});
