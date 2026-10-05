import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme';
import { RouterProvider } from '../../../navigation/router';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { LibraryScreen } from '../../../screens/LibraryScreen';
import { makeDoc } from '../../../test/fixtures';
import { deleteDocumentFiles } from '../../../services/persistence/libraryFiles';
import { SelectionBar } from '../SelectionBar';
import { confirmDelete } from '../useDocumentListActions';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../shared/SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../../shared/SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../../shared/SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));
jest.mock('../../../services/persistence/libraryFiles', () => ({
  ...jest.requireActual('../../../services/persistence/libraryFiles'),
  deleteDocumentFiles: jest.fn(),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

// §14 Q5: a PDF, a Word file and a password-protected PDF.
const mixed = [
  makeDoc({ id: 'pdf', name: 'Notes', format: 'PDF' }),
  makeDoc({ id: 'docx', name: 'Essay', format: 'DOCX' }),
  makeDoc({ id: 'locked', name: 'Locked', format: 'PDF', indexState: 'encrypted' }),
];

describe('SelectionBar delete', () => {
  it('is last and enabled for a mixed selection', () => {
    const onPress = jest.fn();
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <ThemeProvider>
            <SelectionBar selectedDocs={mixed} onPress={onPress} />
          </ThemeProvider>
        </SafeAreaProvider>
      );
    });
    const tools = root.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('selection-tool-') && typeof n.type !== 'string');
    const ids = [...new Set(tools.map((n) => n.props.testID as string))];
    expect(ids[ids.length - 1]).toBe('selection-tool-delete');
    const del = tools.find((n) => n.props.testID === 'selection-tool-delete')!;
    expect(del.props.disabled).toBe(false);
    act(() => del.props.onPress());
    expect(onPress).toHaveBeenCalledWith('delete');
  });
});

describe('confirmDelete', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (deleteDocumentFiles as jest.Mock).mockClear();
  });
  afterEach(() => alert.mockRestore());

  const pressButton = (style: 'cancel' | 'destructive') => {
    const buttons = alert.mock.calls[0][2] as { style: string; onPress?: () => void }[];
    buttons.find((b) => b.style === style)?.onPress?.();
  };

  it('on confirm, removes all ids in one dispatch, then deletes each folder in order', () => {
    const dispatch = jest.fn();
    confirmDelete(mixed, dispatch);
    expect(alert.mock.calls[0][0]).toBe('Delete 3 documents?');
    expect(dispatch).not.toHaveBeenCalled();
    pressButton('destructive');
    const removes = dispatch.mock.calls.filter(([a]) => a.type === 'library/REMOVE_FILES');
    expect(removes).toEqual([[{ type: 'library/REMOVE_FILES', ids: ['pdf', 'docx', 'locked'] }]]);
    expect((deleteDocumentFiles as jest.Mock).mock.calls).toEqual([['pdf'], ['docx'], ['locked']]);
    // The rows go before the files.
    expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan((deleteDocumentFiles as jest.Mock).mock.invocationCallOrder[0]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'library/CLEAR_SELECTION' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'ui/SHOW_SNACK', msg: 'Deleted 3 documents' });
  });

  it('keeps going when one folder fails to delete', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (deleteDocumentFiles as jest.Mock).mockImplementationOnce(() => {
      throw new Error('busy');
    });
    const dispatch = jest.fn();
    confirmDelete(mixed, dispatch);
    pressButton('destructive');
    expect(deleteDocumentFiles).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('on cancel, does nothing', () => {
    const dispatch = jest.fn();
    confirmDelete(mixed, dispatch);
    pressButton('cancel');
    expect(dispatch).not.toHaveBeenCalled();
    expect(deleteDocumentFiles).not.toHaveBeenCalled();
  });

  it("uses the Reader's wording, with the name, for one document", () => {
    confirmDelete([mixed[1]], jest.fn());
    expect(alert.mock.calls[0][0]).toBe('Delete document?');
    expect(alert.mock.calls[0][1]).toContain('"Essay"');
  });
});

describe('Select all', () => {
  it('selects only the visible documents, then none', () => {
    let app!: ReturnType<typeof useAppState>;
    function Probe() {
      app = useAppState();
      return <LibraryScreen />;
    }
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <ThemeProvider>
            <RouterProvider>
              <AppStateProvider>
                <Probe />
              </AppStateProvider>
            </RouterProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      );
    });
    act(() => {
      app.dispatch({ type: 'library/SET_LOAD_STATUS', status: 'ready' });
      // Archived documents are hidden from the list, so Select all leaves them out.
      app.dispatch({ type: 'library/ADD_FILE', file: makeDoc({ id: 'old', archived: true }) });
      app.dispatch({ type: 'library/ADD_FILE', file: makeDoc({ id: 'd1' }) });
      app.dispatch({ type: 'library/ADD_FILE', file: makeDoc({ id: 'd2' }) });
      app.dispatch({ type: 'library/SET_SEL_MODE', on: true });
      app.dispatch({ type: 'library/TOGGLE_SELECTION', id: 'd1' });
    });
    const button = () => root.root.find((n) => n.props.testID === 'select-all' && typeof n.type !== 'string');

    act(() => button().props.onPress());
    expect([...app.state.library.selection].sort()).toEqual(['d1', 'd2']);

    act(() => button().props.onPress());
    expect(app.state.library.selection).toEqual([]);
    expect(app.state.library.selMode).toBe(true);
    act(() => root.unmount());
  });
});
