import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider } from '../../navigation/router';
import { AppStateProvider, useAppState } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import { DoneScreen } from '../DoneScreen';
import { makeDoc, makePage } from '../../test/fixtures';
import type { SavedScan } from '../../store/slices/deliverSlice';

// §17 U9: Done says where the scan went and offers what comes next.

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

let app: ReturnType<typeof useAppState>;
const mounted: ReturnType<typeof create>[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
});

function mount(done: SavedScan) {
  function Capture() {
    app = useAppState();
    return <DoneScreen />;
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
    app.dispatch({ type: 'library/CREATE_COURSE', id: 'c1', name: 'Physics' });
    app.dispatch({ type: 'library/SET_FILES', files: [makeDoc({ id: 'd1', name: 'HW3', courseId: 'c1', pages: [makePage({ id: 'p1' })] })] });
    app.dispatch({ type: 'deliver/SET_DONE', done });
  });
  return root;
}

function texts(root: ReturnType<typeof create>): string[] {
  return root.root
    .findAll((n: ReactTestInstance) => String(n.type) === 'Text')
    .map((n) => n.children.filter((c) => typeof c === 'string').join(''));
}

const byTestId = (root: ReturnType<typeof create>, id: string) => root.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string');

describe('DoneScreen', () => {
  it('says the course, shows the file and offers Submit after a plain save', () => {
    const root = mount({ docId: 'd1', submitted: false, notice: 'Copied to Downloads' });
    const shown = texts(root);
    expect(shown).toEqual(expect.arrayContaining(['Saved to Physics', 'HW3', 'Copied to Downloads']));
    expect(byTestId(root, 'done-submit').length).toBeGreaterThan(0);
    expect(byTestId(root, 'done-open').length).toBeGreaterThan(0);
  });

  it("doesn't offer Submit again right after a submission", () => {
    const root = mount({ docId: 'd1', submitted: true });
    expect(texts(root)).toContain('Saved to Physics and shared');
    expect(byTestId(root, 'done-submit')).toHaveLength(0);
  });

  it('says so when the save was undone', () => {
    const root = mount({ docId: 'd1', submitted: false });
    act(() => app.dispatch({ type: 'library/REMOVE_FILES', ids: ['d1'] }));
    expect(texts(root)).toContain('This scan is no longer in Files.');
    expect(byTestId(root, 'done-open')).toHaveLength(0);
  });
});
