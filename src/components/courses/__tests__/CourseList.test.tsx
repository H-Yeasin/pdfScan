import { Switch, TextInput } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider, useAppState } from '../../../store/AppStateContext';
import { ThemeProvider } from '../../../theme';
import { CourseList } from '../CourseList';

// Icon components load their font through expo-asset; they draw nothing these tests look at.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

type Ctx = ReturnType<typeof useAppState>;

function render() {
  let ctx: Ctx | null = null;
  function Probe() {
    ctx = useAppState();
    return <CourseList counts={{}} unsortedCount={0} />;
  }
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <AppStateProvider>
            <Probe />
          </AppStateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return { root, state: () => ctx!.state, dispatch: (...a: Parameters<Ctx['dispatch']>) => act(() => ctx!.dispatch(...a)) };
}

// Taps the nearest pressable ancestor of the first text with this label that has one (a heading
// can share a button's label).
function press(root: ReturnType<typeof create>, label: string) {
  for (const text of root.root.findAll((n) => n.props.children === label && typeof n.type === 'string')) {
    let node: ReactTestInstance | null = text;
    while (node && !node.props.onPress) node = node.parent;
    if (node) {
      const target = node;
      act(() => target.props.onPress());
      return;
    }
  }
  throw new Error(`Nothing pressable labelled "${label}"`);
}

describe('CourseList quick setup', () => {
  it('adds four courses from the empty state in one go', () => {
    const { root, state } = render();
    press(root, 'Add your courses');

    const inputs = root.root.findAllByType(TextInput);
    // Semester name, then name/code pairs for the four starting rows.
    expect(inputs[0].props.value).toMatch(/^(Spring|Summer|Fall) \d{4}$/);
    const entries = [
      ['Calculus', 'MA 101'],
      ['Physics', ''],
      ['Chemistry', 'CH 110'],
      ['English', ''],
    ];
    entries.forEach(([name, code], i) => {
      act(() => inputs[1 + i * 2].props.onChangeText(name));
      act(() => inputs[2 + i * 2].props.onChangeText(code));
    });
    press(root, 'Add 4 courses');

    const { courses, semesters } = state().library;
    expect(semesters).toHaveLength(1);
    expect(courses.map((c) => [c.name, c.code, c.semesterId])).toEqual(
      entries.map(([name, code]) => [name, code || undefined, semesters[0].id])
    );
    expect(new Set(courses.map((c) => c.color)).size).toBe(4);
  });

  it('hides archived courses until "Show archived" is on', () => {
    const { root, dispatch } = render();
    dispatch({ type: 'library/CREATE_COURSE', id: 'a', name: 'Algebra' });
    dispatch({ type: 'library/CREATE_COURSE', id: 'b', name: 'Botany', fields: { archived: true } });
    const names = () =>
      root.root.findAll((n) => typeof n.type === 'string' && (n.props.children?.[0] === 'Algebra' || n.props.children?.[0] === 'Botany')).map((n) => n.props.children[0]);

    expect(names()).toEqual(['Algebra']);
    act(() => root.root.findByType(Switch).props.onValueChange(true));
    expect(names()).toEqual(['Algebra', 'Botany']);
  });
});
