import { makeDoc } from '../../../test/fixtures';
import { renamedTo } from '../../../services/library/rename';
import { deleteDocumentFiles } from '../../../services/persistence/libraryFiles';
import { splitDocument } from '../../../services/persistence/libraryOperations';
import type { Course } from '../../../types/models';
import { documentActions } from '../useDocumentActions';

jest.mock('../../../services/persistence/libraryOperations', () => ({ splitDocument: jest.fn() }));
jest.mock('../../../services/persistence/libraryFiles', () => ({ deleteDocumentFiles: jest.fn() }));

const courses = [{ id: 'c1', name: 'Physics' }] as Course[];

describe('§18 W23 renamedTo', () => {
  it('cleans the name like a file name, and refuses an empty or unchanged one', () => {
    expect(renamedTo('Scan 1', '  CSE101: HW3  ')).toBe('CSE101 HW3');
    expect(renamedTo('Scan 1', 'a/b')).toBe('a-b');
    expect(renamedTo('Scan 1', '   ')).toBeNull();
    expect(renamedTo('Scan 1', '???')).toBeNull();
    expect(renamedTo('HW3', 'HW3')).toBeNull();
  });
});

describe('§18 W23 documentActions', () => {
  const types = (dispatch: jest.Mock) => dispatch.mock.calls.map(([a]) => a.type);

  it('renames the document, not its files', () => {
    const dispatch = jest.fn();
    const doc = makeDoc({ name: 'Scan 1' });
    expect(documentActions(dispatch, courses).rename(doc, 'Lab report')).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/UPDATE_FILE', id: doc.id, patch: { name: 'Lab report' } });
    expect(types(dispatch)).toEqual(['library/UPDATE_FILE', 'ui/SHOW_SNACK']);
    dispatch.mockClear();
    expect(documentActions(dispatch, courses).rename(doc, 'Scan 1')).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('moves documents to a course or Unsorted, naming it in the snack', () => {
    const dispatch = jest.fn();
    const doc = makeDoc();
    documentActions(dispatch, courses).move([doc], 'c1');
    expect(dispatch.mock.calls[0][0]).toEqual({ type: 'library/ASSIGN_COURSE', ids: [doc.id], courseId: 'c1' });
    expect(dispatch.mock.calls[1][0].msg).toContain('Physics');
    documentActions(dispatch, courses).move([doc], null);
    expect(dispatch.mock.calls[2][0]).toEqual({ type: 'library/ASSIGN_COURSE', ids: [doc.id], courseId: null });
  });

  it('stars and unstars', () => {
    const dispatch = jest.fn();
    documentActions(dispatch, courses).toggleStar(makeDoc({ star: false }));
    documentActions(dispatch, courses).toggleStar(makeDoc({ star: true }));
    expect(dispatch.mock.calls.filter(([a]) => a.type === 'ui/SHOW_SNACK').map(([a]) => a.msg)).toEqual(['Starred', 'Removed from Starred']);
  });

  it('splits, leaves, then replaces the document with its pages', async () => {
    const dispatch = jest.fn();
    const doc = makeDoc();
    const parts = [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })];
    (splitDocument as jest.Mock).mockResolvedValue(parts);
    const order: string[] = [];
    dispatch.mockImplementation((a) => order.push(a.type));
    await documentActions(dispatch, courses).split(doc, [], () => order.push('leave'));
    expect(order).toEqual(['leave', 'library/REPLACE_FILES', 'ui/SHOW_SNACK']);
    expect(deleteDocumentFiles).toHaveBeenCalledWith(doc.id);
  });

  it('stays, with a snack, when the split fails', async () => {
    const dispatch = jest.fn();
    const leave = jest.fn();
    (splitDocument as jest.Mock).mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await documentActions(dispatch, courses).split(makeDoc(), [], leave);
    expect(leave).not.toHaveBeenCalled();
    expect(types(dispatch)).toEqual(['ui/SHOW_SNACK']);
    warn.mockRestore();
  });
});
