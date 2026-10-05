import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme';
import { RouterProvider, useRouter } from '../../../navigation/router';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { AcademicOptionsScreen } from '../../../screens/AcademicOptionsScreen';
import { makeDoc } from '../../../test/fixtures';
import { addCoverToDocument } from '../../../services/persistence/addCover';
import { SelectionBar } from '../SelectionBar';
import { useOpenCoverOptions } from '../useCoverTarget';
import type { LibraryDocument } from '../../../types/models';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-print', () => ({ printAsync: jest.fn() }));
// Skia can't run under Jest: the session preview's renderer and the template thumbnails.
jest.mock('../../../services/enhance/skiaEnhance', () => ({ renderPage: jest.fn() }));
jest.mock('../../deliver/CoverThumbnail', () => ({ CoverThumbnail: () => null }));
jest.mock('../../../services/persistence/addCover', () => ({
  ...jest.requireActual('../../../services/persistence/addCover'),
  addCoverToDocument: jest.fn(),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const pdf = makeDoc({ id: 'pdf', name: 'Notes', format: 'PDF' });
const docx = makeDoc({ id: 'docx', name: 'Essay', format: 'DOCX', pages: [] });

function renderBar(selectedDocs: LibraryDocument[], onPress = jest.fn()) {
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <SelectionBar selectedDocs={selectedDocs} onPress={onPress} />
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  const cover = root.root.find((n) => n.props.testID === 'selection-tool-cover' && typeof n.type !== 'string');
  const dimmed = (cover.props.style as unknown[]).some((s) => !!s && (s as { opacity?: number }).opacity === 0.38);
  return { cover, dimmed, onPress };
}

describe('§14 Q7 SelectionBar Cover', () => {
  it('is enabled for one PDF', () => {
    const { cover, dimmed, onPress } = renderBar([pdf]);
    expect(cover.props.disabled).toBe(false);
    expect(dimmed).toBe(false);
    act(() => cover.props.onPress());
    expect(onPress).toHaveBeenCalledWith('cover');
  });

  it('is disabled for two documents', () => {
    expect(renderBar([pdf, makeDoc({ id: 'pdf2' })]).cover.props.disabled).toBe(true);
  });

  it('is dimmed but tappable for a DOCX, to say why', () => {
    const { cover, dimmed } = renderBar([docx]);
    expect(dimmed).toBe(true);
    expect(cover.props.disabled).toBe(false);
  });
});

type Harness = { app: ReturnType<typeof useAppState>; router: ReturnType<typeof useRouter>; open: ReturnType<typeof useOpenCoverOptions> };

// The app's state, router and the Cover entry point, with Academic options mounted once it's the screen.
function renderApp() {
  const h = {} as Harness;
  function Probe() {
    h.app = useAppState();
    h.router = useRouter();
    h.open = useOpenCoverOptions();
    return h.router.screen === 'academicOptions' ? <AcademicOptionsScreen /> : null;
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
    h.app.dispatch({ type: 'library/SET_LOAD_STATUS', status: 'ready' });
    h.app.dispatch({ type: 'library/ADD_FILE', file: pdf });
    h.app.dispatch({ type: 'library/ADD_FILE', file: docx });
  });
  // As if opened from the Library.
  act(() => h.router.go('library'));
  const apply = () => root.root.find((n) => n.props.testID === 'cover-apply' && typeof n.type !== 'string');
  return { h, root, apply };
}

describe('§14 Q7 Academic options for a library document', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (addCoverToDocument as jest.Mock).mockReset();
  });
  afterEach(() => alert.mockRestore());

  it('says "Convert to PDF first" for a DOCX and stays put', () => {
    const { h, root } = renderApp();
    act(() => h.open(docx));
    expect(h.router.screen).toBe('library');
    expect(h.app.state.deliver.coverTarget).toBeNull();
    expect(h.app.state.ui.snack?.msg).toBe('Covers go on PDFs. Convert this file to PDF first.');
    act(() => root.unmount());
  });

  it('starts with a cover on, and needs one to apply', () => {
    const { h, root, apply } = renderApp();
    act(() => h.open(pdf));
    expect(h.router.screen).toBe('academicOptions');
    expect(h.app.state.deliver.coverTarget).toEqual({ docId: 'pdf', from: 'library' });
    expect(apply().props.disabled).toBe(false);

    act(() => h.app.dispatch({ type: 'deliver/SET_COVER_TARGET_CONFIG', config: { enableBorder: true } }));
    expect(apply().props.disabled).toBe(true);
    // The scan session's options are never touched.
    expect(h.app.state.deliver.academicConfig).toBeNull();
    act(() => root.unmount());
  });

  it('Apply asks Save as a copy / Replace; a copy is added and the Library shown again', async () => {
    const { h, root, apply } = renderApp();
    const copy = makeDoc({ id: 'copy', name: 'Notes (cover)', coverKind: 'template' });
    (addCoverToDocument as jest.Mock).mockResolvedValue({ doc: copy });
    act(() => h.open(pdf));
    act(() => apply().props.onPress());

    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Replace', 'Save as a copy']);

    await act(async () => buttons.find((b) => b.text === 'Save as a copy')!.onPress!());
    const input = (addCoverToDocument as jest.Mock).mock.calls[0][0];
    expect(input.mode).toBe('copy');
    expect(input.doc.id).toBe('pdf');
    expect(input.config.coverPage).toMatchObject({ mode: 'template' });
    expect(h.app.state.library.files[0].id).toBe('copy');
    expect(h.app.state.deliver.coverTarget).toBeNull();
    expect(h.router.screen).toBe('library');
    expect(h.app.state.ui.snack?.msg).toBe('Cover added');
    act(() => root.unmount());
  });

  it('Replace updates the document in place; Cancel does nothing', async () => {
    const { h, root, apply } = renderApp();
    (addCoverToDocument as jest.Mock).mockResolvedValue({ doc: { ...pdf, coverKind: 'template', lastPage: 3 } });
    act(() => h.open(pdf));
    act(() => apply().props.onPress());
    const buttons = () => alert.mock.calls[alert.mock.calls.length - 1][2] as { text: string; onPress?: () => void }[];
    buttons().find((b) => b.text === 'Cancel')!.onPress?.();
    expect(addCoverToDocument).not.toHaveBeenCalled();

    await act(async () => buttons().find((b) => b.text === 'Replace')!.onPress!());
    expect((addCoverToDocument as jest.Mock).mock.calls[0][0].mode).toBe('replace');
    const updated = h.app.state.library.files.find((f) => f.id === 'pdf')!;
    expect(updated.coverKind).toBe('template');
    expect(h.app.state.library.files).toHaveLength(2);
    act(() => root.unmount());
  });
});
