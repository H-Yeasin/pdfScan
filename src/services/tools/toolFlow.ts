import { getTool, needsPick, type ToolId } from './toolRegistry';

// §17 U8: one flow for every tool in the Tools tab: Pick → Options → Run → Result. Pure, so the
// order of the steps is tested without rendering; components/tools/ToolFlow draws each step and
// runs the tool when the flow reaches 'run'.

// What the options step chose. Merge and Split keep the originals unless asked (§17 U7); Compress
// picks a rung of Deliver's quality ladder (1 smallest … 3 sharper; services/capture/imageSpec).
export type CompressLevel = 1 | 2 | 3;
export type ToolOptions = { keepOriginals: boolean; quality: CompressLevel };

export const DEFAULT_TOOL_OPTIONS: ToolOptions = { keepOriginals: true, quality: 2 };

// What a tool made or changed, for the result sheet: the documents (the first is shown, with
// Open and Share) and, for a change in place, the line saying how it went (Compress's).
export type ToolResult = { tool: ToolId; docIds: string[]; message?: string };

export type FlowState =
  | { step: 'idle' }
  | { step: 'pick'; tool: ToolId }
  | { step: 'options'; tool: ToolId; docIds: string[]; options: ToolOptions }
  | { step: 'run'; tool: ToolId; docIds: string[]; options: ToolOptions }
  | { step: 'result'; result: ToolResult };

export type FlowEvent =
  | { type: 'open'; tool: ToolId }
  | { type: 'picked'; docIds: string[] }
  | { type: 'setOptions'; options: Partial<ToolOptions> }
  // Options → Pick, to change what was picked.
  | { type: 'back' }
  | { type: 'confirm' }
  // The run is over: with a result, the result sheet; without one (a hand-off, a gated tool whose
  // result comes later, a share dialog), the flow just ends.
  | { type: 'done'; result: ToolResult | null }
  // The runner already said what went wrong (a snack); the flow ends.
  | { type: 'failed' }
  // A gated tool reports back after its ad and progress, when the flow is long over.
  | { type: 'showResult'; result: ToolResult }
  | { type: 'cancel' };

export const IDLE: FlowState = { step: 'idle' };

function afterPick(tool: ToolId, docIds: string[]): FlowState {
  const options = DEFAULT_TOOL_OPTIONS;
  return getTool(tool).options ? { step: 'options', tool, docIds, options } : { step: 'run', tool, docIds, options };
}

export function toolFlowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case 'open': {
      // A tool can't start over one that is running (its progress sheet is up anyway).
      if (state.step === 'run') return state;
      const tool = getTool(event.tool);
      return needsPick(tool) ? { step: 'pick', tool: tool.id } : { step: 'run', tool: tool.id, docIds: [], options: DEFAULT_TOOL_OPTIONS };
    }
    case 'picked': {
      if (state.step !== 'pick') return state;
      const { min, max } = getTool(state.tool);
      if (event.docIds.length < min || event.docIds.length > max) return state;
      return afterPick(state.tool, event.docIds);
    }
    case 'setOptions':
      if (state.step !== 'options') return state;
      return { ...state, options: { ...state.options, ...event.options } };
    case 'back':
      return state.step === 'options' ? { step: 'pick', tool: state.tool } : state;
    case 'confirm':
      return state.step === 'options' ? { step: 'run', tool: state.tool, docIds: state.docIds, options: state.options } : state;
    case 'done':
      if (state.step !== 'run') return state;
      return event.result ? { step: 'result', result: event.result } : IDLE;
    case 'failed':
      return state.step === 'run' ? IDLE : state;
    case 'showResult':
      // Never over another tool the student has started meanwhile.
      return state.step === 'idle' || state.step === 'result' ? { step: 'result', result: event.result } : state;
    case 'cancel':
      // A run can't be stopped half-way (merge, split and compress have no cancel); it ends itself.
      return state.step === 'run' || state.step === 'idle' ? state : IDLE;
    default:
      return state;
  }
}
