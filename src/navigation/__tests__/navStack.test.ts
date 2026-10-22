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

  it('§17 U5: the tabs are Home · Files · Tools · Me', () => {
    expect(TABS).toEqual(['home', 'library', 'tools', 'settings']);
    expect(initialNav().tab).toBe('home');
  });

  it('popTo goes back to the nearest entry of a screen', () => {
    const nav = push(push(push(initialNav('home'), 'review', 'v1'), 'deliver', 'd1'), 'academicOptions', 'a1');
    expect(screens(popTo(nav, 'review'))).toEqual(['home', 'review']);
    expect(popTo(nav, 'reader')).toBe(nav);
    expect(popTo(nav, 'academicOptions')).toBe(nav);
  });

  it('resetTab goes back to the same root entry', () => {
    const nav = resetTab(push(initialNav('home'), 'storage', 's1'), 'home');
    expect(activeStack(nav)).toEqual([rootEntry('home')]);
  });

  it(`caps each tab at ${MAX_PUSHED} pushed screens, dropping the oldest`, () => {
    const many: ScreenName[] = ['course', 'reader', 'academicOptions', 'pro', 'onboarding', 'storage', 'backup', 'manageFolders'];
    const nav = many.reduce((n, s) => push(n, s, `p-${s}`), initialNav('home'));
    expect(activeStack(nav)).toHaveLength(MAX_PUSHED + 1);
    expect(activeStack(nav)[0]).toEqual(rootEntry('home'));
    expect(screens(nav)).toEqual(['home', ...many.slice(many.length - MAX_PUSHED)]);
  });

  it('replace at boot: a root becomes the tab, anything else is alone on the stack', () => {
    const atFiles = replace(initialNav('home'), 'library', 'x');
    expect(atFiles.tab).toBe('library');
    expect(activeStack(atFiles)).toEqual([rootEntry('library')]);
    const intro = replace(initialNav('home'), 'onboarding', 'o1');
    expect(intro.tab).toBe('home');
    expect(activeStack(intro)).toEqual([{ key: 'o1', screen: 'onboarding' }]);
  });
});

describe('resolveGo: what router.go(to, dir) does', () => {
  it('pushes, sliding', () => {
    const change = go(initialNav('home'), 'storage');
    expect(change).toMatchObject({ kind: 'slide', dir: 'fwd' });
    expect(screens(change.state)).toEqual(['home', 'storage']);
  });

  it("goes back to a screen on the stack with 'back', and pushes it otherwise", () => {
    const nav = go(go(go(initialNav('home'), 'review').state, 'deliver').state, 'academicOptions').state;
    expect(screens(go(nav, 'review', 'back').state)).toEqual(['home', 'review']);
    const pushed = go(nav, 'pro', 'back');
    expect(pushed).toMatchObject({ kind: 'slide', dir: 'back' });
    expect(screens(pushed.state)).toEqual(['home', 'review', 'deliver', 'academicOptions', 'pro']);
  });

  it('its own tab root: back to the root', () => {
    const nav = go(go(initialNav('home'), 'review').state, 'home');
    expect(nav).toMatchObject({ kind: 'slide', dir: 'fwd' });
    expect(activeStack(nav.state)).toEqual([rootEntry('home')]);
  });

  it('another tab root: a cross-fading jump that leaves both tabs at their roots', () => {
    // The Library after a save: the scan flow is over.
    const flow = go(go(initialNav('home'), 'review').state, 'deliver').state;
    const saved = go(flow, 'library');
    expect(saved).toMatchObject({ kind: 'fade', state: { tab: 'library', prevTab: 'home' } });
    expect(screens(saved.state, 'home')).toEqual(['home']);
    expect(screens(saved.state, 'library')).toEqual(['library']);
  });

  it('§17 U5: a scan is pushed on the tab it was started from', () => {
    for (const tab of TABS) {
      const nav = go(go(initialNav(tab), 'review').state, 'deliver').state;
      expect(nav.tab).toBe(tab);
      expect(screens(nav)).toEqual([tab, 'review', 'deliver']);
    }
    // From a course page or the Reader too: Back from Review returns there.
    expect(screens(go(go(initialNav('library'), 'reader').state, 'review').state)).toEqual(['library', 'reader', 'review']);
  });

  it('§17 U5: the one scan session is on one stack only', () => {
    // A Review left open on Home (Deliver → Me to set up a folder), then a scan from Tools.
    let nav = go(go(initialNav('home'), 'review').state, 'deliver').state;
    nav = switchTab(switchTab(nav, 'settings'), 'tools');
    nav = go(nav, 'review').state;
    expect(screens(nav)).toEqual(['tools', 'review']);
    expect(screens(nav, 'home')).toEqual(['home']);
  });

  it('a saved scan lands on its course page without the finished flow under it', () => {
    const flow = go(go(initialNav('home'), 'review').state, 'deliver').state;
    const course = go(flow, 'course');
    expect(course).toMatchObject({ kind: 'slide', dir: 'fwd', state: { tab: 'home' } });
    expect(screens(course.state)).toEqual(['home', 'course']);
    // Back from the course page: Home.
    expect(screens(pop(course.state))).toEqual(['home']);
    // Scanned from that course page: a fresh course page in the old one's place.
    const fromCourse = go(go(go(initialNav('home'), 'course').state, 'review').state, 'deliver').state;
    expect(screens(go(fromCourse, 'course').state)).toEqual(['home', 'course']);
    // Pages added to a document: a fresh Reader where it was.
    const added = go(go(go(go(initialNav('library'), 'reader').state, 'review').state, 'deliver').state, 'reader');
    expect(screens(added.state)).toEqual(['library', 'reader']);
  });

  it('detours from the scan flow stay on top of it', () => {
    const nav = go(go(initialNav('tools'), 'review').state, 'pro').state;
    expect(screens(nav)).toEqual(['tools', 'review', 'pro']);
  });
});
