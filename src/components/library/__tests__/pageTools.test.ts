import { makeDoc, makePage } from '../../../test/fixtures';
import { deleteDocumentFiles } from '../../../services/persistence/libraryFiles';
import { UNDO_WINDOW_MS } from '../../../services/library/pendingDeletes';
import type { Annotation, LibraryDocument, Submission } from '../../../types/models';
import { runPageTool } from '../useDocumentListActions';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../shared/SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../../shared/SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../../shared/SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));
jest.mock('../../../services/persistence/libraryFiles', () => ({
  ...jest.requireActual('../../../services/persistence/libraryFiles'),
  deleteDocumentFiles: jest.fn(),
}));

const mockMerged = makeDoc({ id: 'merged', name: 'Merged_2_files' });
const mockParts = [makeDoc({ id: 'p1', name: 'Notes_p1' }), makeDoc({ id: 'p2', name: 'Notes_p2' })];
const mockCopiedMark = { id: 'annot_copy', documentId: 'merged' } as Annotation;
const mockOps = {
  mergeDocuments: jest.fn(async () => mockMerged),
  mergeDocumentsKeeping: jest.fn(async () => ({ docs: [mockMerged], annotations: [mockCopiedMark] })),
  splitDocument: jest.fn(async () => mockParts),
  splitDocumentKeeping: jest.fn(async () => ({ docs: mockParts, annotations: [] })),
};
jest.mock('../../../services/persistence/libraryOperations', () => mockOps);

const a = makeDoc({ id: 'a', name: 'A', pages: [makePage({ id: 'pa' })] });
const b = makeDoc({ id: 'b', name: 'B', pages: [makePage({ id: 'pb' })] });
const mark = { id: 'm1', documentId: 'a', pageId: 'pa' } as Annotation;
const other = { id: 'm2', documentId: 'zzz', pageId: 'px' } as Annotation;
const submission = { id: 's1', documentId: 'a', createdAt: 1 } as Submission;

type Snack = { type: 'ui/SHOW_SNACK'; msg: string; action?: string; onAction?: () => void };

function setup() {
  const dispatch = jest.fn();
  const open = jest.fn();
  const ctx = { dispatch, annotations: [mark, other], submissions: [submission], open };
  const snacks = () => dispatch.mock.calls.map(([x]) => x).filter((x): x is Snack => x.type === 'ui/SHOW_SNACK');
  return { dispatch, open, ctx, snacks };
}

beforeEach(() => {
  jest.useFakeTimers();
  (deleteDocumentFiles as jest.Mock).mockClear();
  Object.values(mockOps).forEach((fn) => fn.mockClear());
});
afterEach(() => jest.useRealTimers());

// §17 U7: a merge or split keeps its originals unless asked; deleting them waits out Undo.
describe('runPageTool, keeping the originals', () => {
  it('merges into a new document beside them, with copied marks, and deletes nothing', async () => {
    const { dispatch, open, ctx, snacks } = setup();
    await runPageTool('merge', [a, b], false, ctx);
    expect(mockOps.mergeDocumentsKeeping).toHaveBeenCalledWith([a, b], [mark]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/ADD_FILES', files: [mockMerged], annotations: [mockCopiedMark] });
    expect(dispatch.mock.calls.some(([x]) => x.type === 'library/REPLACE_FILES' || x.type === 'library/REMOVE_FILES')).toBe(false);
    // The result is selected and scrolled to; the snack opens it.
    expect(dispatch).toHaveBeenCalledWith({ type: 'libraryUi/REVEAL', id: 'merged', select: true });
    const [snack] = snacks();
    expect(snack.msg).toBe('Merged into "Merged_2_files"');
    expect(snack.action).toBe('Open');
    snack.onAction!();
    expect(open).toHaveBeenCalledWith(mockMerged);
    jest.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(deleteDocumentFiles).not.toHaveBeenCalled();
  });

  it('splits beside the original', async () => {
    const { dispatch, ctx } = setup();
    await runPageTool('split', [a], false, ctx);
    expect(mockOps.splitDocumentKeeping).toHaveBeenCalledWith(a, [mark]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/ADD_FILES', files: mockParts, annotations: [] });
    jest.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(deleteDocumentFiles).not.toHaveBeenCalled();
  });
});

describe('runPageTool, deleting the originals', () => {
  it('replaces them at once and deletes their folders once, after the Undo window', async () => {
    const { dispatch, ctx, snacks } = setup();
    await runPageTool('merge', [a, b], true, ctx);
    expect(mockOps.mergeDocuments).toHaveBeenCalledWith([a, b], [mark]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/REPLACE_FILES', ids: ['a', 'b'], files: [mockMerged] });
    expect(snacks()[0].action).toBe('Undo');
    expect(deleteDocumentFiles).not.toHaveBeenCalled();
    jest.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(deleteDocumentFiles).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect((deleteDocumentFiles as jest.Mock).mock.calls).toEqual([['a'], ['b']]);
    jest.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(deleteDocumentFiles).toHaveBeenCalledTimes(2);
  });

  it('Undo in time puts the originals back with their submissions and deletes what was made', async () => {
    const { dispatch, ctx, snacks } = setup();
    await runPageTool('split', [a], true, ctx);
    const [snack] = snacks();
    dispatch.mockClear();
    snack.onAction!();
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/REPLACE_FILES', ids: ['p1', 'p2'], files: [a], submissions: [submission] });
    expect((deleteDocumentFiles as jest.Mock).mock.calls).toEqual([['p1'], ['p2']]);
    // The original's folder stays: the window was cancelled.
    jest.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(deleteDocumentFiles).toHaveBeenCalledTimes(2);
  });

  it('Undo after the window says it is too late and changes nothing', async () => {
    const { dispatch, ctx, snacks } = setup();
    await runPageTool('merge', [a, b], true, ctx);
    const [snack] = snacks();
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
    dispatch.mockClear();
    snack.onAction!();
    expect(dispatch.mock.calls.map(([x]) => x)).toEqual([{ type: 'ui/SHOW_SNACK', msg: 'Too late to undo: the originals are gone' }]);
  });
});
