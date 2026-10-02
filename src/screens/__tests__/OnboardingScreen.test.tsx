import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RouterProvider, useRouter } from '../../navigation/router';
import { AppStateProvider, useAppState } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import { OnboardingScreen } from '../OnboardingScreen';

// Icon components load their font through expo-asset; they draw nothing these tests look at.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

type Probe = { app: ReturnType<typeof useAppState>; router: ReturnType<typeof useRouter> };

function render() {
  const probe = {} as Probe;
  function Probe() {
    probe.app = useAppState();
    probe.router = useRouter();
    return <OnboardingScreen />;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <AppStateProvider>
            <RouterProvider>
              <Probe />
            </RouterProvider>
          </AppStateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return { root, probe };
}

function press(root: ReturnType<typeof create>, label: string) {
  const text = root.root.findAll((n) => n.props.children === label && typeof n.type === 'string')[0];
  if (!text) throw new Error(`No "${label}"`);
  let node: ReactTestInstance | null = text;
  while (node && !node.props.onPress) node = node.parent;
  const target = node!;
  act(() => target.props.onPress());
}

function inputWithPlaceholder(root: ReturnType<typeof create>, placeholder: string): ReactTestInstance {
  return root.root.findAll((n) => n.type === TextInput && n.props.placeholder === placeholder)[0];
}

describe('OnboardingScreen', () => {
  it('Skip keeps what was typed so far and finishes', () => {
    const { root, probe } = render();
    act(() => inputWithPlaceholder(root, 'e.g. Rahim Uddin').props.onChangeText('Nusrat'));
    press(root, 'Skip');
    expect(probe.app.state.settings.profile.name).toBe('Nusrat');
    expect(probe.app.state.settings.onboardingDone).toBe(true);
    // No courses: Capture, where the first scan starts.
    expect(probe.router.screen).toBe('capture');
  });

  it('Start saves the courses typed and goes Home', () => {
    const { root, probe } = render();
    press(root, 'Next');
    press(root, 'Next');
    const names = root.root.findAll((n) => n.type === TextInput && n.props.autoCapitalize === 'words');
    act(() => names[0].props.onChangeText('Chemistry'));
    act(() => names[1].props.onChangeText('Calculus'));
    press(root, 'Start');
    expect(probe.app.state.library.courses.map((c) => c.name).sort()).toEqual(['Calculus', 'Chemistry']);
    expect(probe.app.state.settings.onboardingDone).toBe(true);
    expect(probe.router.screen).toBe('home');
  });

  it('shows the file name the profile makes', () => {
    const { root } = render();
    act(() => inputWithPlaceholder(root, 'e.g. Rahim Uddin').props.onChangeText('Nusrat'));
    expect(root.root.findAll((n) => n.props.children === '2021331045_Nusrat_CSE101_HW1.pdf').length).toBeGreaterThan(0);
  });
});
