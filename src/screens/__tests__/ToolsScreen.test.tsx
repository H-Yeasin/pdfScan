import { Alert } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider } from '../../navigation/router';
import { AppStateProvider, useAppState } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import { ToolsScreen } from '../ToolsScreen';
import { makeDoc, makePage } from '../../test/fixtures';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../components/shared/SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../../components/shared/SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../../components/shared/SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));
jest.mock('../../services/pdf/pdfNative', () => ({ ...jest.requireActual('../../services/pdf/pdfNative'), isPdfNativeAvailable: () => true }));

const mockMerged = makeDoc({ id: 'merged', name: 'Merged notes', pages: [makePage({ id: 'm1' }), makePage({ id: 'm2' })] });
jest.mock('../../services/persistence/libraryOperations', () => ({
  mergeDocumentsKeeping: jest.fn(async () => ({ docs: [mockMerged], annotations: [] })),
}));
// The Pro gate: no pass, so it offers the ad (and nothing runs until it is watched).
jest.mock('../../services/pro/proTaskFlow', () => ({
  ...jest.requireActual('../../services/pro/proTaskFlow'),
  checkProTask: jest.fn(async () => 'offerAd'),
  completeProTask: jest.fn(async () => undefined),
}));

// Ads are off in development builds; a test turns them on to see the Pro tools.
let mockAdsEnabled = false;
jest.mock('../../services/remote/remoteConfig', () => {
  const actual = jest.requireActual('../../services/remote/remoteConfig');
  return { ...actual, useRemoteConfig: () => ({ ...actual.useRemoteConfig(), adsEnabled: mockAdsEnabled }) };
});

const { mergeDocumentsKeeping } = jest.requireMock('../../services/persistence/libraryOperations') as { mergeDocumentsKeeping: jest.Mock };
const { checkProTask, completeProTask } = jest.requireMock('../../services/pro/proTaskFlow') as { checkProTask: jest.Mock; completeProTask: jest.Mock };

let app: ReturnType<typeof useAppState>;
const mounted: ReturnType<typeof create>[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  jest.clearAllMocks();
  mockAdsEnabled = false;
});

function mount() {
  function Capture() {
    app = useAppState();
    return <ToolsScreen />;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <RouterProvider>
            <AppStateProvider>
              <Capture />
            </AppStateProvider>
          </RouterProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  mounted.push(root);
  act(() => {
    app.dispatch({
      type: 'library/SET_FILES',
      files: [
        makeDoc({ id: 'a', name: 'Week 1', format: 'PDF', pages: [makePage({ id: 'a1' })] }),
        makeDoc({ id: 'b', name: 'Week 2', format: 'PDF', pages: [makePage({ id: 'b1' })] }),
        makeDoc({ id: 'w', name: 'Essay', format: 'DOCX', pages: [], contentUri: 'file:///essay.docx' }),
      ],
    });
  });
  return root;
}

function byTestId(root: ReturnType<typeof create>, id: string): ReactTestInstance {
  return root.root.find((n) => n.props.testID === id && !!n.props.onPress);
}

function pressId(root: ReturnType<typeof create>, id: string) {
  const node = byTestId(root, id);
  act(() => node.props.onPress());
}

function hasTestId(root: ReturnType<typeof create>, id: string): boolean {
  return root.root.findAll((n) => n.props.testID === id).length > 0;
}

const flush = () => act(async () => undefined);

describe('Tools tab', () => {
  it('runs Merge as pick → options → run → result, keeping the originals', async () => {
    const root = mount();
    pressId(root, 'tool-merge');
    // The picker offers the PDFs only, not the Word file.
    expect(hasTestId(root, 'picker-row-a')).toBe(true);
    expect(hasTestId(root, 'picker-row-w')).toBe(false);
    expect(byTestId(root, 'picker-confirm').props.disabled).toBe(true);

    pressId(root, 'picker-row-a');
    pressId(root, 'picker-row-b');
    pressId(root, 'picker-confirm');
    expect(hasTestId(root, 'tool-options')).toBe(true);

    pressId(root, 'tool-options-run');
    await flush();
    expect(mergeDocumentsKeeping).toHaveBeenCalledTimes(1);
    expect(mergeDocumentsKeeping.mock.calls[0][0].map((d: { id: string }) => d.id)).toEqual(['a', 'b']);
    expect(app.state.library.files.map((d) => d.id)).toEqual(expect.arrayContaining(['a', 'b', 'merged']));
    expect(hasTestId(root, 'tool-result')).toBe(true);
    // Remembered for "Recently used".
    expect(app.state.settings.recentTools).toEqual(['merge']);
  });

  it('hides the Pro tools when no ad could unlock them (ads off, tasks not free)', () => {
    const root = mount();
    expect(hasTestId(root, 'tool-merge')).toBe(true);
    expect(hasTestId(root, 'tool-toWord')).toBe(false);
  });

  it('sends a Pro tool through the Pro task gate', async () => {
    mockAdsEnabled = true;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => buttons?.[1]?.onPress?.());
    const root = mount();
    pressId(root, 'tool-toWord');
    pressId(root, 'picker-row-a');
    await flush();
    expect(alert).toHaveBeenCalled();
    expect(checkProTask).toHaveBeenCalledWith(expect.objectContaining({ feature: 'convert', docId: 'a' }), expect.any(Number));
    // Offered the ad, so nothing ran yet.
    expect(completeProTask).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
