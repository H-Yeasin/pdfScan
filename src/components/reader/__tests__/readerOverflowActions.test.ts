import { Alert } from 'react-native';
import { makeDoc } from '../../../test/fixtures';
import { readerMoreItems, type ReaderMoreItemId } from '../../../services/documents/readerTools';
import { promoteExternalToLibrary } from '../../../services/persistence/libraryOperations';
import { deleteDocumentFiles } from '../../../services/persistence/libraryFiles';
import type { ExternalFileDocument } from '../../../types/models';
import { readerOverflowActions, type ReaderOverflowContext } from '../useReaderOverflowActions';

jest.mock('../../../services/persistence/libraryOperations', () => ({ promoteExternalToLibrary: jest.fn() }));
jest.mock('../../../services/persistence/libraryFiles', () => ({ deleteDocumentFiles: jest.fn() }));
jest.mock('../../../services/sharing/shareService', () => ({
  printDocument: jest.fn(),
  printFileUri: jest.fn(),
  shareAs: jest.fn(),
  shareDocument: jest.fn(),
  shareFileName: jest.fn(),
  shareFileUri: jest.fn(),
}));

// Every More item. A Record, so this list fails to compile when an id is added or removed.
const ALL_ITEMS: Record<ReaderMoreItemId, true> = {
  addToLibrary: true,
  submit: true,
  share: true,
  export: true,
  convertToPdf: true,
  convertToWord: true,
  editFile: true,
  fillForm: true,
  print: true,
  sign: true,
  editPages: true,
  addCover: true,
  changeCover: true,
  bookmarks: true,
  copyText: true,
  extractText: true,
  readingSettings: true,
  changeType: true,
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
    convertToPdf: jest.fn(),
    convertToWord: jest.fn(),
    editFile: jest.fn(),
    fillForm: jest.fn(),
    ...overrides,
  };
}

describe('§18 W6 the More sheet handlers', () => {
  it('has a handler for every More item', () => {
    const actions = readerOverflowActions(context());
    expect(Object.keys(actions).sort()).toEqual(Object.keys(ALL_ITEMS).sort());
    for (const id of Object.keys(ALL_ITEMS) as ReaderMoreItemId[]) expect(typeof actions[id]).toBe('function');
    // And so for everything a scan or an outside file lists.
    for (const id of [...readerMoreItems({ doc: makeDoc() }), ...readerMoreItems({ external: { format: 'PDF' } })]) {
      expect(actions[id]).toBeDefined();
    }
  });

  it('opens the sheets through the state machine', () => {
    const ctx = context();
    const actions = readerOverflowActions(ctx);
    void actions.readingSettings();
    void actions.bookmarks();
    void actions.changeType();
    expect((ctx.openSheet as jest.Mock).mock.calls).toEqual([[{ kind: 'reading' }], [{ kind: 'bookmarks' }], [{ kind: 'type' }]]);
  });

  it('hands the Reader flows their own starters', () => {
    const ctx = context();
    const actions = readerOverflowActions(ctx);
    for (const id of ['sign', 'editPages', 'convertToPdf', 'convertToWord', 'editFile', 'fillForm'] as const) void actions[id]();
    for (const fn of [ctx.sign, ctx.editPages, ctx.convertToPdf, ctx.convertToWord, ctx.editFile, ctx.fillForm]) expect(fn).toHaveBeenCalledTimes(1);
    void actions.addCover();
    void actions.changeCover();
    expect(ctx.openCoverOptions).toHaveBeenCalledTimes(2);
    expect(ctx.openCoverOptions).toHaveBeenLastCalledWith(ctx.doc);
  });

  it('does nothing for a library-only item on a file from outside', async () => {
    const ctx = context({ doc: undefined, external });
    const actions = readerOverflowActions(ctx);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    for (const id of ['changeType', 'submit', 'addCover', 'copyText', 'extractText', 'delete'] as const) await actions[id]();
    expect(ctx.openSheet).not.toHaveBeenCalled();
    expect(ctx.submit).not.toHaveBeenCalled();
    expect(ctx.openCoverOptions).not.toHaveBeenCalled();
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
});
