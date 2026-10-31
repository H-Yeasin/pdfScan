import {
  activeStack,
  backToTab,
  initialNav,
  isRootEntry,
  MAX_HISTORY,
  pop,
  popTo,
  push,
  replace,
  resetTab,
  reopen,
  resolveGo,
  restoreSubject,
  rootEntry,
  sameSubject,
  subjectFor,
  switchTab,
  TABS,
  topEntry,
  type EntrySubject,
  type NavState,
} from '../navStack';
import { initialAppState } from '../../store/initialState';
import type { NavDir, ScreenName } from '../../types/navigation';

let keys = 0;
const key = () => `k${++keys}`;
const screens = (nav: NavState, tab = nav.tab) => nav.stacks[tab].map((e) => e.screen);
const go = (nav: NavState, to: ScreenName, dir: NavDir = 'fwd', subject?: EntrySubject) => resolveGo(nav, to, dir, key(), subject);
const doc = (id: string): EntrySubject => ({ kind: 'doc', id });
const course = (id: string): EntrySubject => ({ kind: 'course', id });

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

  it('pushes a screen again with its own subject; Back gives each one back in turn', () => {
    // Reader A → its course → Reader B.
    let nav = push(push(push(initialNav('library'), 'reader', 'rA', doc('A')), 'course', 'c1', course('C')), 'reader', 'rB', doc('B'));
    expect(screens(nav)).toEqual(['library', 'reader', 'course', 'reader']);
    nav = pop(nav);
    expect(topEntry(nav)).toEqual({ key: 'c1', screen: 'course', subject: course('C') });
    nav = pop(nav);
    expect(topEntry(nav)).toEqual({ key: 'rA', screen: 'reader', subject: doc('A') });
    // Already on top with the same subject: nothing changes, the instance stays.
    expect(push(nav, 'reader', 'r3', doc('A'))).toBe(nav);
    // Another document: pushed over it.
    expect(screens(push(nav, 'reader', 'r4', doc('B')))).toEqual(['library', 'reader', 'reader']);
    // A root is never pushed: that's back to it.
    expect(screens(push(nav, 'library', 'x'))).toEqual(['library']);
  });

  it('keeps one scan flow: Review opened again is the one on the stack', () => {
    const nav = push(push(push(initialNav('home'), 'review', 'v1'), 'academicOptions', 'a1'), 'review', 'v2');
    expect(activeStack(nav)).toEqual([rootEntry('home'), { key: 'v1', screen: 'review' }]);
  });

  it('reopen puts a fresh instance in place of the nearest one', () => {
    const nav = push(push(initialNav('library'), 'reader', 'rA', doc('A')), 'academicOptions', 'a1');
    expect(activeStack(reopen(nav, 'reader', 'rA2'))).toEqual([rootEntry('library'), { key: 'rA2', screen: 'reader', subject: doc('A') }]);
    expect(screens(reopen(initialNav('home'), 'storage', 's1'))).toEqual(['home', 'storage']);
  });

  it('switching tabs keeps each tab’s stack; a second tap resets', () => {
    let nav = push(push(initialNav('library'), 'course', 'c1'), 'reader', 'r1');
    nav = switchTab(nav, 'home');
    expect(nav).toMatchObject({ tab: 'home', tabTrail: ['library'] });
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

  it('keeps a long history: nothing is dropped below the safety cap', () => {
    const many: ScreenName[] = ['course', 'reader', 'academicOptions', 'pro', 'onboarding', 'storage', 'backup', 'manageFolders', 'pro', 'storage'];
    const nav = many.reduce((n, s, i) => push(n, s, `p-${i}`), initialNav('home'));
    expect(screens(nav)).toEqual(['home', ...many]);
    let back = nav;
    for (const s of [...many].reverse()) {
      expect(topEntry(back).screen).toBe(s);
      back = pop(back);
    }
    expect(screens(back)).toEqual(['home']);
  });

  it(`drops the oldest entry above the root past ${MAX_HISTORY}`, () => {
    let nav = initialNav('home');
    for (let i = 0; i < MAX_HISTORY + 5; i++) nav = push(nav, 'reader', `r${i}`, doc(`d${i}`));
    expect(activeStack(nav)).toHaveLength(MAX_HISTORY + 1);
    expect(activeStack(nav)[0]).toEqual(rootEntry('home'));
    expect(activeStack(nav)[1].key).toBe('r5');
  });

  it('records the tabs left, most recent last, each once', () => {
    let nav = initialNav('home');
    nav = switchTab(nav, 'library');
    nav = switchTab(nav, 'tools');
    expect(nav.tabTrail).toEqual(['home', 'library']);
    nav = switchTab(nav, 'home');
    expect(nav.tabTrail).toEqual(['library', 'tools']);
    nav = switchTab(nav, 'tools');
    expect(nav.tabTrail).toEqual(['library', 'home']);
  });

  it('backToTab returns to the tabs left, in reverse, then Home', () => {
    let nav = switchTab(switchTab(push(initialNav('home'), 'storage', 's1'), 'library'), 'tools');
    let change = backToTab(nav);
    expect(change).toMatchObject({ kind: 'fade', dir: 'back', state: { tab: 'library', tabTrail: ['home'] } });
    nav = backToTab(change.state).state;
    // Home as it was left, with its pushed screen.
    expect(nav).toMatchObject({ tab: 'home', tabTrail: [] });
    expect(screens(nav)).toEqual(['home', 'storage']);
    // Nothing left: Home, unrecorded, so there's no loop between two tabs.
    change = backToTab({ ...initialNav('settings') });
    expect(change.state).toMatchObject({ tab: 'home', tabTrail: [] });
    expect(backToTab(initialNav('home')).state).toEqual(initialNav('home'));
  });

  it('subjects: compared, read from the store and restored to it', () => {
    expect(sameSubject(doc('A'), doc('A'))).toBe(true);
    expect(sameSubject(doc('A'), doc('B'))).toBe(false);
    expect(sameSubject(doc('A'), course('A'))).toBe(false);
    expect(sameSubject(undefined, undefined)).toBe(true);
    expect(sameSubject(doc('A'), undefined)).toBe(false);
    const ext = { uri: 'file:///x.pdf', name: 'x.pdf', format: 'PDF', sizeBytes: 1, sourceUri: 'content://x', importedAt: 1 } as const;
    expect(sameSubject({ kind: 'external', doc: ext }, { kind: 'external', doc: { ...ext } })).toBe(true);

    const state = { ...initialAppState, reader: { ...initialAppState.reader, readerId: 'B' }, libraryUi: { ...initialAppState.libraryUi, activeCourseId: 'C' } };
    expect(subjectFor('reader', state)).toEqual(doc('B'));
    expect(subjectFor('course', state)).toEqual(course('C'));
    expect(subjectFor('storage', state)).toBeUndefined();
    expect(restoreSubject({ key: 'r', screen: 'reader', subject: doc('A') }, state)).toEqual({ type: 'reader/SET_READER_ID', id: 'A' });
    expect(restoreSubject({ key: 'r', screen: 'reader', subject: doc('B') }, state)).toBeNull();
    expect(restoreSubject({ key: 'c', screen: 'course', subject: course('D') }, state)).toEqual({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'D' });
    expect(restoreSubject({ key: 'x', screen: 'reader', subject: { kind: 'external', doc: ext } }, state)).toEqual({ type: 'reader/SET_EXTERNAL', doc: ext });
    expect(restoreSubject({ key: 's', screen: 'storage' }, state)).toBeNull();
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

  it('another tab root: a cross-fading jump that ends a scan flow and keeps the rest', () => {
    // The Library after a save: the scan flow is over.
    const flow = go(go(go(initialNav('home'), 'course', 'fwd', course('C')).state, 'review').state, 'deliver').state;
    const saved = go(flow, 'library');
    expect(saved).toMatchObject({ kind: 'fade', state: { tab: 'library', tabTrail: ['home'] } });
    expect(screens(saved.state, 'home')).toEqual(['home', 'course']);
    expect(screens(saved.state, 'library')).toEqual(['library']);
    // Done is left behind too.
    const done = go(go(go(initialNav('home'), 'review').state, 'deliver').state, 'done').state;
    expect(screens(go(done, 'library').state, 'home')).toEqual(['home']);
    // Home's "See all": Home keeps what it had open, and Back returns to it.
    const seeAll = go(go(initialNav('home'), 'storage').state, 'library').state;
    expect(screens(seeAll, 'home')).toEqual(['home', 'storage']);
    expect(screens(backToTab(seeAll).state)).toEqual(['home', 'storage']);
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
    const reader = go(initialNav('library'), 'reader', 'fwd', doc('A')).state;
    const added = go(go(go(reader, 'review').state, 'deliver').state, 'reader', 'fwd', doc('A'));
    expect(screens(added.state)).toEqual(['library', 'reader']);
    expect(topEntry(added.state).key).not.toBe(topEntry(reader).key);
    expect(topEntry(added.state).subject).toEqual(doc('A'));
  });

  it('detours from the scan flow stay on top of it', () => {
    const nav = go(go(initialNav('tools'), 'review').state, 'pro').state;
    expect(screens(nav)).toEqual(['tools', 'review', 'pro']);
  });

  // §17 U9: Scan → Save → Done.
  it('Done takes the place of Review and Save, so Back returns to where the scan started', () => {
    const fromCourse = go(go(go(initialNav('home'), 'course').state, 'review').state, 'deliver').state;
    const done = go(fromCourse, 'done').state;
    expect(screens(done)).toEqual(['home', 'course', 'done']);
    expect(screens(pop(done))).toEqual(['home', 'course']);
  });

  it('opening the saved file from Done leaves Done behind', () => {
    const done = go(go(go(initialNav('library'), 'review').state, 'deliver').state, 'done').state;
    expect(screens(go(done, 'reader', 'fwd', doc('A')).state)).toEqual(['library', 'reader']);
    // Pages added to the Reader the scan started from: Done gives way to a fresh instance of it.
    const reader = go(initialNav('library'), 'reader', 'fwd', doc('A')).state;
    const added = go(go(go(go(reader, 'review').state, 'deliver').state, 'done').state, 'reader', 'fwd', doc('A')).state;
    expect(screens(added)).toEqual(['library', 'reader']);
    expect(topEntry(added).key).not.toBe(topEntry(reader).key);
    // Another document from that Done: pushed over the first.
    const other = go(go(go(go(reader, 'review').state, 'deliver').state, 'done').state, 'reader', 'fwd', doc('B')).state;
    expect(screens(other)).toEqual(['library', 'reader', 'reader']);
  });

  it('a scan started on another tab takes a finished Done off this one', () => {
    const done = go(go(go(initialNav('library'), 'review').state, 'deliver').state, 'done').state;
    const other = go(switchTab(done, 'home'), 'review').state;
    expect(other.stacks.library.map((e) => e.screen)).toEqual(['library']);
  });
});
