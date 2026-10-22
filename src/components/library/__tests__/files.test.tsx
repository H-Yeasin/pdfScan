import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme';
import { RouterProvider } from '../../../navigation/router';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { useImportFile } from '../../../store/useImportFile';
import { LibraryScreen } from '../../../screens/LibraryScreen';
import { makeDoc } from '../../../test/fixtures';
import { FileRow } from '../FileRow';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../shared/SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../../shared/SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../../shared/SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///cache/Essay.docx', name: 'Essay.docx', mimeType: 'application/msword' }] })),
}));
jest.mock('../../../services/files/externalFileService', () => ({
  ...jest.requireActual('../../../services/files/externalFileService'),
  importExternalFile: jest.fn(async () => ({ uri: 'file:///ext/Essay.docx', name: 'Essay', format: 'DOCX' })),
}));
jest.mock('../../../services/persistence/libraryOperations', () => ({
  promoteExternalToLibrary: jest.fn(async () => mockImported),
}));

const mockImported = makeDoc({ id: 'imported', name: 'Essay', format: 'DOCX', pages: [] });
const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

type Harness = { app: ReturnType<typeof useAppState>; importFile: ReturnType<typeof useImportFile> };

function render(child: React.ReactNode = null) {
  const h = {} as Harness;
  function Probe() {
    h.app = useAppState();
    h.importFile = useImportFile();
    return <>{child}</>;
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
  return { h, root };
}

// §17 U7: Import file in Files adds to the library and stays.
describe('Files import', () => {
  it('adds the document under the filtered course, scrolls to it and offers to open it', async () => {
    const { h, root } = render();
    await act(async () => {
      await h.importFile({ stay: true, courseId: 'c1' });
    });
    const added = h.app.state.library.files.find((f) => f.id === 'imported');
    expect(added?.courseId).toBe('c1');
    expect(h.app.state.libraryUi.revealId).toBe('imported');
    expect(h.app.state.ui.snack).toMatchObject({ msg: 'Added "Essay"', action: 'Open' });
    // Nothing opened yet.
    expect(h.app.state.reader.readerId ?? null).toBeNull();
    act(() => root.unmount());
  });
});

describe('FileRow', () => {
  it('is a checkbox with its state while selecting, a button with a ⋯ otherwise', () => {
    const doc = makeDoc({ id: 'd', name: 'Lab 2' });
    const props = { doc, matchSnippet: undefined, onPress: jest.fn(), onLongPress: jest.fn(), onMore: jest.fn() };
    const { root } = render(<FileRow {...props} selected selectionMode />);
    const checkbox = root.root.find((n) => n.props.accessibilityRole === 'checkbox' && typeof n.type !== 'string');
    expect(checkbox.props.accessibilityState).toMatchObject({ checked: true });
    act(() => root.unmount());

    const plain = render(<FileRow {...props} selected={false} selectionMode={false} />).root;
    const more = plain.root.find((n) => n.props.accessibilityLabel === 'More for Lab 2' && typeof n.type !== 'string');
    act(() => more.props.onPress());
    expect(props.onMore).toHaveBeenCalledWith(doc);
    act(() => plain.unmount());
  });
});

describe('LibraryScreen (Files)', () => {
  const rows = (root: ReactTestRenderer) =>
    [...new Set(root.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('file-row-')).map((n) => n.props.testID as string))];

  it('lists by the saved order, and Starred narrows it', () => {
    const { h, root } = render(<LibraryScreen />);
    act(() => {
      h.app.dispatch({ type: 'library/SET_LOAD_STATUS', status: 'ready' });
      h.app.dispatch({
        type: 'library/SET_FILES',
        files: [
          makeDoc({ id: 'b', name: 'Biology', createdAt: 2 }),
          makeDoc({ id: 'a', name: 'Algebra', createdAt: 1, star: true }),
          makeDoc({ id: 'c', name: 'Chemistry', createdAt: 3 }),
        ],
      });
    });
    expect(rows(root)).toEqual(['file-row-c', 'file-row-b', 'file-row-a']);

    act(() => h.app.dispatch({ type: 'settings/SET_FILES_VIEW', view: { sort: { key: 'name', dir: 'asc' } } }));
    expect(rows(root)).toEqual(['file-row-a', 'file-row-b', 'file-row-c']);

    const starred = root.root.find((n) => n.props.testID === 'files-starred' && typeof n.type !== 'string');
    act(() => starred.props.onPress());
    expect(rows(root)).toEqual(['file-row-a']);
    expect(h.app.state.libraryUi.filters.starred).toBe(true);
    act(() => root.unmount());
  });
});
