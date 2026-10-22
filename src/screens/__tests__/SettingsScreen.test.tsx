import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider } from '../../navigation/router';
import { AppStateProvider, useAppState } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import { SettingsScreen } from '../SettingsScreen';
import { DEFAULT_NAME_TEMPLATE } from '../../services/submit/naming';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../components/courses/TimetableEditor', () => ({ TimetableEditor: () => null }));

let app: ReturnType<typeof useAppState>;
const mounted: ReturnType<typeof create>[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
});

function mount() {
  function Capture() {
    app = useAppState();
    return <SettingsScreen />;
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
  return root;
}

function pressable(root: ReturnType<typeof create>, id: string): ReactTestInstance {
  return root.root.find((n) => n.props.testID === id && !!n.props.onPress);
}

// The row's own Touchable carries the role's state.
const checked = (root: ReturnType<typeof create>, id: string) =>
  root.root.find((n) => n.props.testID === id && n.props.accessibilityState !== undefined).props.accessibilityState.checked;

const texts = (root: ReturnType<typeof create>) =>
  root.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string);

describe('SettingsScreen (Me)', () => {
  it('asks for the details while the profile is empty, then shows them', () => {
    const root = mount();
    expect(texts(root)).toContain('Add your details');
    act(() => app.dispatch({ type: 'settings/SET_PROFILE', profile: { name: 'Rahim Uddin', roll: '2021331045', institution: 'SUST' } }));
    expect(texts(root)).toEqual(expect.arrayContaining(['RU', 'Rahim Uddin', '2021331045 · SUST']));
  });

  it('hides the language rows while English is the only language', () => {
    const root = mount();
    expect(texts(root)).not.toContain('App language');
    expect(texts(root)).not.toContain('Document language');
  });

  it('picks a file name preset, and opens the editor for Custom…', () => {
    const root = mount();
    act(() => pressable(root, 'me-file-names').props.onPress());
    expect(checked(root, 'name-preset-default')).toBe(true);
    act(() => pressable(root, 'name-preset-courseDate').props.onPress());
    expect(app.state.settings.nameTemplate).toBe('{course}_{date}');
    expect(texts(root)).not.toContain('Naming template');
    act(() => pressable(root, 'name-preset-custom').props.onPress());
    expect(texts(root)).toContain('Naming template');
    expect(checked(root, 'name-preset-custom')).toBe(true);
    expect(checked(root, 'name-preset-courseDate')).toBe(false);
    act(() => pressable(root, 'name-preset-default').props.onPress());
    expect(app.state.settings.nameTemplate).toBe(DEFAULT_NAME_TEMPLATE);
  });

  it('sets the default scan mode from its sheet', () => {
    const root = mount();
    act(() => pressable(root, 'me-default-mode').props.onPress());
    act(() => pressable(root, 'me-mode-book').props.onPress());
    expect(app.state.settings.lastCaptureMode).toBe('book');
  });
});
