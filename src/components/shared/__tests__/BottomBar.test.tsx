import { Animated, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider } from '../../../navigation/router';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { ThemeProvider } from '../../../theme';
import { LibraryScreen } from '../../../screens/LibraryScreen';
import { ReaderToolBar } from '../../reader/ReaderToolBar';
import { makeDoc } from '../../../test/fixtures';
import { BottomBar } from '../BottomBar';
import { Snackbar } from '../Snackbar';
import { spacing } from '../../../theme';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../SignatureCaptureModal', () => ({ SignatureCaptureModal: () => null }));
jest.mock('../SignatureModal', () => ({ SignatureModal: () => null }));
jest.mock('../SignaturePlacementOverlay', () => ({ SignaturePlacementOverlay: () => null }));

// §14 Q3: a phone with the 3-button navigation bar (48 dp) under an edge-to-edge app.
const NAV_BAR = 48;
const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 780 },
  insets: { top: 24, left: 0, right: 0, bottom: NAV_BAR },
};

function wrap(children: React.ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <RouterProvider>
          <AppStateProvider>{children}</AppStateProvider>
        </RouterProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function paddingBottomOf(root: ReactTestRenderer, testID: string): number | undefined {
  const node = root.root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID)[0];
  return StyleSheet.flatten(node?.props.style)?.paddingBottom as number | undefined;
}

describe('bottom insets', () => {
  it("lifts the Library's selection bar above the navigation bar", () => {
    let app!: ReturnType<typeof useAppState>;
    function Probe() {
      app = useAppState();
      return <LibraryScreen />;
    }
    let root!: ReactTestRenderer;
    act(() => {
      root = create(wrap(<Probe />));
    });
    act(() => {
      app.dispatch({ type: 'library/SET_LOAD_STATUS', status: 'ready' });
      app.dispatch({ type: 'library/ADD_FILE', file: makeDoc({ id: 'd1' }) });
      app.dispatch({ type: 'library/SET_SEL_MODE', on: true });
      app.dispatch({ type: 'library/TOGGLE_SELECTION', id: 'd1' });
    });

    expect(paddingBottomOf(root, 'selection-bar')).toBe(NAV_BAR);
  });

  it("pads the Reader's tool bar by the inset", () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        wrap(<ReaderToolBar visible={new Animated.Value(1)} tools={[{ id: 'notes', pro: false }]} onPress={() => {}} />)
      );
    });

    expect(paddingBottomOf(root, 'reader-tool-bar')).toBe(NAV_BAR);
  });

  it('floats the snackbar above a bottom bar, and back down when the bar goes', () => {
    let app!: ReturnType<typeof useAppState>;
    function Probe({ bar }: { bar: boolean }) {
      app = useAppState();
      return (
        <>
          {bar ? (
            <BottomBar backgroundColor="#fff" testID="bar">
              {null}
            </BottomBar>
          ) : null}
          <Snackbar />
        </>
      );
    }
    let root!: ReactTestRenderer;
    act(() => {
      root = create(wrap(<Probe bar />));
    });
    const bar = root.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'bar')[0];
    act(() => {
      bar.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 120 } } });
      app.dispatch({ type: 'ui/SHOW_SNACK', msg: 'Saved' });
    });
    const snackBottom = () => {
      const node = root.root.findAll((n) => typeof n.type === 'string' && n.props.pointerEvents === 'box-none')[0];
      return StyleSheet.flatten(node.props.style).bottom;
    };
    expect(snackBottom()).toBe(120 + spacing.sm);

    act(() => {
      root.update(wrap(<Probe bar={false} />));
    });
    expect(snackBottom()).toBe(NAV_BAR + spacing.sm);
    act(() => root.unmount());
  });
});
