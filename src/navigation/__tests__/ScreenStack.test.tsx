import { useEffect, useState, type ComponentType } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../../store/AppStateContext';
import { ThemeProvider } from '../../theme';
import type { ScreenName } from '../../types/navigation';
import { RouterProvider, useRouter } from '../router';
import { useScreenRole, type ScreenRole } from '../screenRole';
import { MAX_MOUNTED, ScreenStack, type ScreenMap } from '../ScreenStack';
import { FADE_DURATION_MS, SLIDE_DURATION_MS } from '../transitions';

// Its async first read would land outside act(); the slides are what's tested here.
jest.mock('../../theme/useReducedMotion', () => ({ useReducedMotion: () => false }));
// §17 U5: the tab bar draws icons, which load their font through expo-asset.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// §16 G2: each screen is a mock that counts its mounts and says its role, so the test sees what
// the layers do to real screens: nothing is mounted twice, and only the top screen is on screen.
const mounts: Partial<Record<ScreenName, number>> = {};
const unmounts: Partial<Record<ScreenName, number>> = {};
const roles: Partial<Record<ScreenName, ScreenRole>> = {};
const cache: Partial<Record<ScreenName, ComponentType>> = {};

function mockScreen(name: ScreenName): ComponentType {
  return function MockScreen() {
    roles[name] = useScreenRole();
    useEffect(() => {
      mounts[name] = (mounts[name] ?? 0) + 1;
      return () => {
        unmounts[name] = (unmounts[name] ?? 0) + 1;
      };
    }, []);
    return <Text>{`screen:${name}`}</Text>;
  };
}

const SCREENS = new Proxy({} as ScreenMap, {
  get: (_target, name: ScreenName) => (cache[name] ??= mockScreen(name)),
});

let router: ReturnType<typeof useRouter>;
let root: ReactTestRenderer;

// Like AppNavigator: the start screen is chosen before the stack first renders.
function Boot({ start }: { start: ScreenName }) {
  router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    router.replace(start);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ready ? <ScreenStack screens={SCREENS} /> : null;
}

function mount(start: ScreenName = 'home') {
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <AppStateProvider>
            <RouterProvider>
              <Boot start={start} />
            </RouterProvider>
          </AppStateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
}

// Navigates and lets the transition finish.
function nav(step: () => void, ms = SLIDE_DURATION_MS) {
  act(step);
  act(() => {
    jest.advanceTimersByTime(ms + 50);
  });
}

const rendered = (name: ScreenName) => root.root.findAll((n) => n.props.children === `screen:${name}` && typeof n.type === 'string').length;

// The style of the layer a screen sits in (its nearest ancestor with `pointerEvents`).
function layerStyle(name: ScreenName) {
  let node: ReactTestInstance | null = root.root.find((n) => n.props.children === `screen:${name}` && typeof n.type === 'string');
  while (node && node.props.pointerEvents === undefined) node = node.parent;
  return StyleSheet.flatten(node?.props.style);
}

const tabBars = () => root.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'tab').length;

beforeEach(() => {
  jest.useFakeTimers();
  for (const record of [mounts, unmounts, roles]) for (const key of Object.keys(record)) delete record[key as ScreenName];
});

afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
});

describe('ScreenStack (§16 G2)', () => {
  it('mounts each screen once across push → pop', () => {
    mount('home');
    nav(() => router.go('course'));
    nav(() => router.go('reader'));
    expect(mounts).toEqual({ home: 1, course: 1, reader: 1 });
    // Under the Reader, Home and the course page are kept, hidden.
    expect(roles).toMatchObject({ home: 'hidden', course: 'hidden', reader: 'active' });
    expect(layerStyle('course')).toMatchObject({ display: 'none' });

    nav(() => router.back());
    expect(mounts).toEqual({ home: 1, course: 1, reader: 1 });
    expect(unmounts).toEqual({ reader: 1 });
    expect(rendered('reader')).toBe(0);
    expect(roles.course).toBe('active');
    expect(layerStyle('course')).not.toMatchObject({ display: 'none' });

    nav(() => router.back());
    expect(unmounts).toEqual({ reader: 1, course: 1 });
    expect(mounts.home).toBe(1);
    expect(roles.home).toBe('active');
  });

  it(`mounts only the top ${MAX_MOUNTED} pushed screens; deeper ones mount again when Back reaches them`, () => {
    mount('home');
    const many: ScreenName[] = ['course', 'storage', 'backup', 'pro', 'manageFolders', 'examPack', 'academicOptions', 'uiGallery'];
    for (const s of many) nav(() => router.go(s));
    const shown = many.filter((s) => rendered(s) > 0);
    expect(shown).toEqual(many.slice(-MAX_MOUNTED));
    expect(unmounts).toMatchObject({ course: 1, storage: 1 });
    // Back ×(n-1): each screen in turn, the deep ones mounted afresh.
    for (const s of [...many].reverse().slice(1)) {
      nav(() => router.back());
      expect(roles[s]).toBe('active');
      expect(rendered(s)).toBe(1);
    }
    expect(mounts).toMatchObject({ course: 2, storage: 2 });
  });

  it('keeps the screen that leaves until its slide has ended', () => {
    mount('home');
    nav(() => router.go('storage'));
    act(() => router.back());
    // Mid-slide: Settings is still there, sliding out.
    expect(rendered('storage')).toBe(1);
    expect(roles.storage).toBe('outgoing');
    expect(roles.home).toBe('active');
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION_MS + 50);
    });
    expect(rendered('storage')).toBe(0);
  });

  it('keeps every visited tab root mounted across tab switches', () => {
    mount('home');
    nav(() => router.switchTab('library'), FADE_DURATION_MS);
    nav(() => router.switchTab('tools'), FADE_DURATION_MS);
    nav(() => router.switchTab('home'), FADE_DURATION_MS);
    nav(() => router.switchTab('library'), FADE_DURATION_MS);
    expect(mounts).toEqual({ home: 1, library: 1, tools: 1 });
    expect(unmounts).toEqual({});
    expect(roles).toMatchObject({ home: 'hidden', tools: 'hidden', library: 'active' });
  });

  it('draws one tab bar, on the roots only', () => {
    mount('home');
    expect(tabBars()).toBe(4);
    nav(() => router.switchTab('library'), FADE_DURATION_MS);
    expect(tabBars()).toBe(4);
    // Under a pushed screen the shell (and its tab bar) is hidden.
    nav(() => router.go('reader'));
    const shell = root.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'tab')[0];
    let node: ReactTestInstance | null = shell;
    let hidden = false;
    while (node) {
      if (StyleSheet.flatten(node.props.style)?.display === 'none') hidden = true;
      node = node.parent;
    }
    expect(hidden).toBe(true);
  });

  it("doesn't mount a tab root before it is shown", () => {
    // First run: the introduction is the boot screen; Capture's root waits until it's shown.
    mount('onboarding');
    expect(mounts).toEqual({ onboarding: 1 });
    nav(() => router.go('home'), FADE_DURATION_MS);
    expect(mounts).toEqual({ onboarding: 1, home: 1 });
    expect(unmounts).toEqual({ onboarding: 1 });
  });

  // The second way a kept native value blanks Home: Home → Me fades Home's layer to 0 natively;
  // the introduction is pushed on Me, and its Skip goes to Home with the shell carrying the
  // movement. Without native writes of its own, Home's layer kept the 0 under a visible tab bar.
  it('drives the root the shell reveals, so a kept opacity 0 is written over', () => {
    mount('home');
    nav(() => router.switchTab('settings'), FADE_DURATION_MS);
    nav(() => router.go('onboarding'));
    act(() => router.go('home'));
    let node: ReactTestInstance | null = root.root.find((n) => n.props.children === 'screen:home' && typeof n.type === 'string');
    while (node && node.type !== Animated.View) node = node.parent;
    const opacity = StyleSheet.flatten(node?.props.style)?.opacity as unknown;
    expect(typeof opacity).toBe('object');
    expect(opacity).toHaveProperty('__getValue');
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION_MS + 50);
    });
    expect(roles.home).toBe('active');
  });

  // On Android a value the native driver writes stays on the view, over what React sends next
  // (RN 0.86's synchronous mount props override), so a write after a slide has started can put a
  // layer back where it started, for good: after onboarding's Skip, Home's shell stayed a
  // screen's width off to the right. The fake driver here can't show that; what it can show is
  // that nothing writes to a slide's value once the slide is running.
  it("never writes to a transition's value once it has started", () => {
    const timing = jest.spyOn(Animated, 'timing');
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    try {
      mount('onboarding');
      nav(() => router.go('home'));
      nav(() => router.go('reader'));
      nav(() => router.back());
      nav(() => router.switchTab('library'), FADE_DURATION_MS);
      expect(roles).toMatchObject({ home: 'hidden', library: 'active' });

      const slides = timing.mock.calls
        .map(([value, config], i) => ({ value, config, started: timing.mock.invocationCallOrder[i] }))
        .filter(({ config }) => config.duration === SLIDE_DURATION_MS || config.duration === FADE_DURATION_MS);
      expect(slides).toHaveLength(4);
      // One value each.
      expect(new Set(slides.map(({ value }) => value)).size).toBe(4);
      for (const { value, started } of slides) {
        const later = setValue.mock.contexts.filter((context, j) => context === value && setValue.mock.invocationCallOrder[j] > started);
        expect(later).toHaveLength(0);
      }
    } finally {
      timing.mockRestore();
      setValue.mockRestore();
    }
  });
});
