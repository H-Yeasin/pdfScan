import { Alert } from 'react-native';
import { makeDoc } from '../../../test/fixtures';
import { readerMoreItemIds, readerMoreSections, type ReaderMoreItemId } from '../../../services/documents/readerTools';
import { promoteExternalToLibrary } from '../../../services/persistence/libraryOperations';
import { deleteDocumentFiles } from '../../../services/persistence/libraryFiles';
import { shareDocumentImages } from '../../../services/sharing/shareService';
import type { ExternalFileDocument } from '../../../types/models';
import { readerOverflowActions, type ReaderOverflowContext } from '../useReaderOverflowActions';

jest.mock('../../../services/persistence/libraryOperations', () => ({ promoteExternalToLibrary: jest.fn() }));
jest.mock('../../../services/persistence/libraryFiles', () => ({ deleteDocumentFiles: jest.fn() }));
jest.mock('../../../services/sharing/shareService', () => ({
  printDocument: jest.fn(),
  printFileUri: jest.fn(),
  shareAs: jest.fn(),
  shareDocument: jest.fn(),
  shareDocumentImages: jest.fn(),
  shareFileName: jest.fn(),
  shareFileUri: jest.fn(),
}));
jest.mock('../../../services/study/textExport', () => ({ writeDocumentText: jest.fn(() => 'file:///cache/text.txt') }));

// Every More item. A Record, so this list fails to compile when an id is added or removed.
const ALL_ITEMS: Record<ReaderMoreItemId, true> = {
  submit: true,
  share: true,
  shareAsPdf: true,
  shareImages: true,
  print: true,
  addToLibrary: true,
  rename: true,
  move: true,
  star: true,
  changeType: true,
  editPages: true,
  addCover: true,
  changeCover: true,
  split: true,
  compress: true,
  saveText: true,
  sign: true,
  readingSettings: true,
  delete: true,
};

const external: ExternalFileDocument = { uri: 'file:///outside/notes.pdf', name: 'notes.pdf', format: 'PDF' } as ExternalFileDocument;

function context(overrides: Partial<ReaderOverflowContext> = {}): ReaderOverflowContext {
  return {
    doc: makeDoc(),
    external: null,
    pdfUri: 'file:///library/doc/document.pdf',
    annotations: [],
    title: 'Notes',
    isPageRaster: true,
    pageCount: 4,
    pdfPage: 3,
    dispatch: jest.fn(),
    t: ((key: string) => key) as ReaderOverflowContext['t'],
    back: jest.fn(),
    openSheet: jest.fn(),
    submit: jest.fn(),
    sign: jest.fn(),
    editPages: jest.fn(),
    openCoverOptions: jest.fn(),
    documentActions: { rename: jest.fn(), move: jest.fn(), toggleStar: jest.fn(), split: jest.fn(), compress: jest.fn() },
    ...overrides,
  };
}

describe('§18 W6 the More sheet handlers', () => {
  it('has a handler for every More item', () => {
    const actions = readerOverflowActions(context());
    expect(Object.keys(actions).sort()).toEqual(Object.keys(ALL_ITEMS).sort());
    for (const id of Object.keys(ALL_ITEMS) as ReaderMoreItemId[]) expect(typeof actions[id]).toBe('function');
    // And so for everything a scan or an outside file lists.
    for (const id of [...readerMoreItemIds(readerMoreSections({ doc: makeDoc() })), ...readerMoreItemIds(readerMoreSections({ external: { format: 'PDF' } }))]) {
      expect(actions[id]).toBeDefined();
    }
  });

  it('opens the sheets through the state machine', () => {
    const ctx = context();
    const actions = readerOverflowActions(ctx);
    void actions.readingSettings();
    void actions.changeType();
    void actions.rename();
    void actions.move();
    expect((ctx.openSheet as jest.Mock).mock.calls).toEqual([[{ kind: 'reading' }], [{ kind: 'type' }], [{ kind: 'rename' }], [{ kind: 'move' }]]);
  });

  it('hands the Reader flows their own starters', () => {
    const ctx = context();
    const actions = readerOverflowActions(ctx);
    for (const id of ['sign', 'editPages'] as const) void actions[id]();
    for (const fn of [ctx.sign, ctx.editPages]) expect(fn).toHaveBeenCalledTimes(1);
    void actions.addCover();
    void actions.changeCover();
    expect(ctx.openCoverOptions).toHaveBeenCalledTimes(2);
    expect(ctx.openCoverOptions).toHaveBeenLastCalledWith(ctx.doc);
  });

  it('does nothing for a library-only item on a file from outside', async () => {
    const ctx = context({ doc: undefined, external });
    const actions = readerOverflowActions(ctx);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    for (const id of ['changeType', 'submit', 'addCover', 'rename', 'move', 'star', 'split', 'compress', 'saveText', 'shareImages', 'delete'] as const) await actions[id]();
    expect(ctx.openSheet).not.toHaveBeenCalled();
    expect(ctx.submit).not.toHaveBeenCalled();
    expect(ctx.openCoverOptions).not.toHaveBeenCalled();
    for (const fn of Object.values(ctx.documentActions)) expect(fn).not.toHaveBeenCalled();
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('adds an outside file to the library on the page being read', async () => {
    // §18 W5.
    const promoted = makeDoc({ id: 'promoted' });
    (promoteExternalToLibrary as jest.Mock).mockResolvedValue(promoted);
    const ctx = context({ doc: undefined, external });
    await readerOverflowActions(ctx).addToLibrary();
    expect((ctx.dispatch as jest.Mock).mock.calls.map(([a]) => a.type)).toEqual(['library/ADD_FILE', 'reader/SET_READER_ID', 'ui/SHOW_SNACK']);
    expect((ctx.dispatch as jest.Mock).mock.calls[0][0].file.lastPage).toBe(3);
  });

  it('deletes only after the confirmation, then leaves', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const ctx = context();
    void readerOverflowActions(ctx).delete();
    expect(ctx.dispatch).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'library/REMOVE_FILES', ids: [ctx.doc!.id] });
    expect(deleteDocumentFiles).toHaveBeenCalledWith(ctx.doc!.id);
    expect(ctx.back).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('stars, splits and compresses through the shared document actions (§18 W23)', async () => {
    const ctx = context();
    const actions = readerOverflowActions(ctx);
    await actions.star();
    await actions.split();
    await actions.compress();
    expect(ctx.documentActions.toggleStar).toHaveBeenCalledWith(ctx.doc);
    // Split leaves the Reader: the document is replaced by its pages.
    expect(ctx.documentActions.split).toHaveBeenCalledWith(ctx.doc, ctx.annotations, ctx.back);
    expect(ctx.documentActions.compress).toHaveBeenCalledWith(ctx.doc);
  });

  it('shares every page of a JPG-format document (§18 W23)', async () => {
    const ctx = context({ doc: makeDoc({ format: 'JPG' }) });
    await readerOverflowActions(ctx).shareImages();
    expect(shareDocumentImages).toHaveBeenCalledWith(ctx.doc);
  });
});
