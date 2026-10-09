import {
  activeStack,
  initialNav,
  isRootEntry,
  MAX_PUSHED,
  pop,
  popTo,
  push,
  replace,
  resetTab,
  resolveGo,
  rootEntry,
  switchTab,
  TABS,
  topEntry,
  type NavState,
} from '../navStack';
import type { NavDir, ScreenName } from '../../types/navigation';

let keys = 0;
const key = () => `k${++keys}`;
const screens = (nav: NavState, tab = nav.tab) => nav.stacks[tab].map((e) => e.screen);
const go = (nav: NavState, to: ScreenName, dir: NavDir = 'fwd') => resolveGo(nav, to, dir, key());

describe('navStack (§16 G2)', () => {
  it('starts every tab at its root, with fixed root keys', () => {
    const nav = initialNav('home');
    expect(nav.tab).toBe('home');
    for (const tab of TABS) {
      expect(nav.stacks[tab]).toEqual([rootEntry(tab)]);
      expect(isRootEntry(nav.stacks[tab][0])).toBe(true);
    }
  });

  it('pushes and pops', () => {
    let nav = push(initialNav('home'), 'course', 'c1');
    nav = push(nav, 'reader', 'r1');
    expect(screens(nav)).toEqual(['home', 'course', 'reader']);
    expect(topEntry(nav)).toEqual({ key: 'r1', screen: 'reader' });
    nav = pop(nav);
    expect(topEntry(nav)).toEqual({ key: 'c1', screen: 'course' });
    nav = pop(pop(nav));
    // The root stays.
    expect(screens(nav)).toEqual(['home']);
  });

  it('keeps one instance of a screen per stack', () => {
    const nav = push(push(push(initialNav('library'), 'reader', 'r1'), 'academicOptions', 'a1'), 'reader', 'r2');
    // The Reader lower down (showing the store's current document) is dropped with what was above it.
    expect(activeStack(nav)).toEqual([rootEntry('library'), { key: 'r2', screen: 'reader' }]);
    // Already on top: nothing changes, the instance stays.
    expect(push(nav, 'reader', 'r3')).toBe(nav);
    // A root is never pushed: that's back to it.
    expect(screens(push(nav, 'library', 'x'))).toEqual(['library']);
  });

  it('switching tabs keeps each tab’s stack; a second tap resets', () => {
    let nav = push(push(initialNav('library'), 'course', 'c1'), 'reader', 'r1');
    nav = switchTab(nav, 'home');
    expect(nav).toMatchObject({ tab: 'home', prevTab: 'library' });
    nav = switchTab(nav, 'library');
    expect(screens(nav)).toEqual(['library', 'course', 'reader']);
    expect(topEntry(nav).key).toBe('r1');
    nav = switchTab(nav, 'library');
    expect(activeStack(nav)).toEqual([rootEntry('library')]);
    // Already at the root: unchanged.
    expect(switchTab(nav, 'library')).toBe(nav);
  });

  it('popTo goes back to the nearest entry of a screen', () => {
    const nav = push(push(push(initialNav('capture'), 'review', 'v1'), 'deliver', 'd1'), 'academicOptions', 'a1');
    expect(screens(popTo(nav, 'review'))).toEqual(['capture', 'review']);
    expect(popTo(nav, 'reader')).toBe(nav);
    expect(popTo(nav, 'academicOptions')).toBe(nav);
  });

  it('resetTab goes back to the same root entry', () => {
    const nav = resetTab(push(initialNav('home'), 'settings', 's1'), 'home');
    expect(activeStack(nav)).toEqual([rootEntry('home')]);
  });

  it(`caps each tab at ${MAX_PUSHED} pushed screens, dropping the oldest`, () => {
    const many: ScreenName[] = ['course', 'reader', 'academicOptions', 'pro', 'settings', 'storage', 'backup', 'manageFolders'];
    const nav = many.reduce((n, s) => push(n, s, `p-${s}`), initialNav('home'));
    expect(activeStack(nav)).toHaveLength(MAX_PUSHED + 1);
    expect(activeStack(nav)[0]).toEqual(rootEntry('home'));
    expect(screens(nav)).toEqual(['home', ...many.slice(many.length - MAX_PUSHED)]);
  });

  it('replace at boot: a root becomes the tab, anything else is alone on the stack', () => {
    const atHome = replace(initialNav('capture'), 'home', 'x');
    expect(atHome.tab).toBe('home');
    expect(activeStack(atHome)).toEqual([rootEntry('home')]);
    const intro = replace(initialNav('capture'), 'onboarding', 'o1');
    expect(intro.tab).toBe('capture');
    expect(activeStack(intro)).toEqual([{ key: 'o1', screen: 'onboarding' }]);
  });
});

describe('resolveGo: what router.go(to, dir) does', () => {
  it('pushes, sliding', () => {
    const change = go(initialNav('home'), 'settings');
    expect(change).toMatchObject({ kind: 'slide', dir: 'fwd' });
    expect(screens(change.state)).toEqual(['home', 'settings']);
  });

  it("goes back to a screen on the stack with 'back', and pushes it otherwise", () => {
    const nav = go(go(go(initialNav('capture'), 'review').state, 'deliver').state, 'academicOptions').state;
    expect(screens(go(nav, 'review', 'back').state)).toEqual(['capture', 'review']);
    const pushed = go(nav, 'settings', 'back');
    expect(pushed).toMatchObject({ kind: 'slide', dir: 'back' });
    expect(screens(pushed.state)).toEqual(['capture', 'review', 'deliver', 'academicOptions', 'settings']);
  });

  it('its own tab root: back to the root', () => {
    const nav = go(go(initialNav('capture'), 'review').state, 'capture');
    expect(nav).toMatchObject({ kind: 'slide', dir: 'fwd' });
    expect(activeStack(nav.state)).toEqual([rootEntry('capture')]);
  });

  it('another tab root: a cross-fading jump that leaves both tabs at their roots', () => {
    // Scan from a course page.
    const course = go(initialNav('home'), 'course').state;
    const scan = go(course, 'capture');
    expect(scan).toMatchObject({ kind: 'fade', state: { tab: 'capture', prevTab: 'home' } });
    expect(screens(scan.state, 'home')).toEqual(['home']);
    // The Library after a save: the scan flow is over.
    const saved = go(go(go(scan.state, 'review').state, 'deliver').state, 'library');
    expect(saved.state.tab).toBe('library');
    expect(screens(saved.state, 'capture')).toEqual(['capture']);
    expect(screens(saved.state, 'library')).toEqual(['library']);
  });

  it('library content from the Scan tab opens on the previous tab', () => {
    // Home → Scan → Review → Deliver → saved into a course.
    const flow = go(go(go(initialNav('home'), 'capture').state, 'review').state, 'deliver').state;
    const course = go(flow, 'course');
    expect(course).toMatchObject({ kind: 'slide', dir: 'fwd', state: { tab: 'home', prevTab: 'capture' } });
    expect(screens(course.state)).toEqual(['home', 'course']);
    expect(screens(course.state, 'capture')).toEqual(['capture']);
    // Back from the course page: Home.
    expect(screens(pop(course.state))).toEqual(['home']);
    // Started on the Scan tab (no courses yet): the Library.
    expect(go(initialNav('capture'), 'reader').state.tab).toBe('library');
  });

  it('settings and detours stay on the Scan tab', () => {
    const nav = go(initialNav('capture'), 'settings').state;
    expect(nav.tab).toBe('capture');
    expect(screens(nav)).toEqual(['capture', 'settings']);
  });
});
