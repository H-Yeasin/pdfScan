import { resolveBack, type BackContext, type BackStep } from '../backHandling';
import { activeStack, initialNav, pop, replace, resolveGo, topEntry, type NavState } from '../navStack';
import type { ScreenName } from '../../types/navigation';

const base: BackContext = {
  screen: 'home',
  tab: 'home',
  canPop: false,
  selMode: false,
  searchOpen: false,
  sessionPageCount: 0,
  retakeTargetId: null,
  highlightDeadlineId: null,
};
const ctx = (patch: Partial<BackContext>): BackContext => ({ ...base, ...patch });

let keys = 0;
// Navigation the way the screens do it: router.go(to, dir).
function walk(start: NavState, ...screens: ScreenName[]): NavState {
  return screens.reduce((nav, to) => resolveGo(nav, to, 'fwd', `k${++keys}`).state, start);
}

// One Back press, resolved from the stack and applied the way AppNavigator applies it.
function pressBack(nav: NavState, patch: Partial<BackContext> = {}): { step: BackStep; nav: NavState } {
  const step = resolveBack(ctx({ screen: topEntry(nav).screen, tab: nav.tab, canPop: activeStack(nav).length > 1, ...patch }));
  if (step.kind === 'pop') return { step, nav: pop(nav) };
  if (step.kind === 'go') return { step, nav: resolveGo(nav, step.to, 'back', `k${++keys}`).state };
  return { step, nav };
}

const home = initialNav('home');

describe('resolveBack order', () => {
  it('leaves selection before anything else', () => {
    expect(resolveBack(ctx({ screen: 'course', tab: 'library', canPop: true, selMode: true }))).toEqual({
      kind: 'dispatch',
      actions: [{ type: 'libraryUi/CLEAR_SELECTION' }],
    });
    // Even on the root tab: selection first, exit only on the next press.
    expect(resolveBack(ctx({ screen: 'home', selMode: true })).kind).toBe('dispatch');
  });

  it('closes Library search, then goes back to the start tab', () => {
    expect(resolveBack(ctx({ screen: 'library', tab: 'library', searchOpen: true }))).toEqual({
      kind: 'dispatch',
      actions: [{ type: 'libraryUi/TOGGLE_SEARCH_OPEN' }],
    });
    expect(resolveBack(ctx({ screen: 'library', tab: 'library' }))).toEqual({ kind: 'go', to: 'home', actions: [] });
  });

  it('ignores a stale selection on screens without a document list', () => {
    expect(resolveBack(ctx({ screen: 'reader', tab: 'library', canPop: true, selMode: true }))).toEqual({ kind: 'pop', actions: [] });
  });

  it('pops to wherever a screen was opened from', () => {
    const back = (nav: NavState) => topEntry(pressBack(nav).nav).screen;
    expect(back(walk(home, 'course', 'reader'))).toBe('course');
    expect(back(walk(initialNav('library'), 'reader'))).toBe('library');
    expect(back(walk(initialNav('settings'), 'manageFolders'))).toBe('settings');
    expect(back(walk(initialNav('tools'), 'backup'))).toBe('tools');
    // §10 M6: Pro is a plain push, so Back returns to the screen it was opened from.
    expect(back(walk(home, 'review', 'academicOptions', 'pro'))).toBe('academicOptions');
    expect(back(walk(home, 'course', 'examPack'))).toBe('course');
  });

  it('§17 U5: Me is a tab: its root goes Home, like the other tabs', () => {
    const { nav } = pressBack(initialNav('settings'));
    expect(nav.tab).toBe('home');
    expect(activeStack(nav).map((e) => e.screen)).toEqual(['home']);
  });

  it('Storage opened by the low-space guard goes back to the screen that opened it', () => {
    // useSpaceGuard, from a document in the Library: no Settings in between.
    const nav = walk(initialNav('library'), 'reader', 'storage');
    expect(topEntry(pressBack(nav).nav).screen).toBe('reader');
    // From Me → Storage, it's Me.
    expect(topEntry(pressBack(walk(initialNav('settings'), 'storage')).nav).screen).toBe('settings');
  });

  it('keeps the scan flow’s fixed steps back', () => {
    const to = (patch: Partial<BackContext>) => {
      const step = resolveBack(ctx({ canPop: true, tab: 'home', ...patch }));
      return step.kind === 'go' ? step.to : step.kind;
    };
    // §17 U5: Review pops to the tab the scan was started on (asking first, below).
    expect(to({ screen: 'review' })).toBe('pop');
    expect(to({ screen: 'deliver' })).toBe('review');
    // The scan session's Academic options: back to wherever they were opened (Review or Deliver).
    expect(to({ screen: 'academicOptions' })).toBe('pop');
    // §14 Q7: set up for a library document's cover, back where that started.
    expect(to({ screen: 'academicOptions', coverTarget: { from: 'reader' } })).toBe('reader');
    expect(to({ screen: 'academicOptions', coverTarget: { from: 'course' } })).toBe('course');
  });

  it('does the screen’s Back clean-up on the way out', () => {
    expect(resolveBack(ctx({ screen: 'review', tab: 'home', canPop: true, retakeTargetId: 'p1' }))).toEqual({
      kind: 'pop',
      actions: [{ type: 'capture/SET_RETAKE_TARGET', id: null }],
    });
    expect(resolveBack(ctx({ screen: 'course', canPop: true, highlightDeadlineId: 'd1' }))).toEqual({
      kind: 'pop',
      actions: [{ type: 'libraryUi/SET_HIGHLIGHT_DEADLINE', id: null }],
    });
  });

  it('on a root: to Home from another tab, out of the app from Home', () => {
    expect(resolveBack(ctx({ screen: 'home' }))).toEqual({ kind: 'exit' });
    for (const tab of ['library', 'tools', 'settings'] as const) {
      expect(resolveBack(ctx({ screen: tab, tab }))).toEqual({ kind: 'go', to: 'home', actions: [] });
    }
    // Applied: the Library tab's root goes to Home's.
    const { nav } = pressBack(initialNav('library'));
    expect(nav.tab).toBe('home');
    expect(topEntry(nav).screen).toBe('home');
  });

  it('asks before exiting with an unsaved scan', () => {
    expect(resolveBack(ctx({ screen: 'home', sessionPageCount: 8 }))).toEqual({ kind: 'confirmDiscard', count: 8, then: 'exit' });
    // Another tab's root goes Home first, the pages kept.
    expect(resolveBack(ctx({ screen: 'tools', tab: 'tools', sessionPageCount: 8 })).kind).toBe('go');
  });

  it('§17 U5: Back from Review asks before the scan goes, then returns to the tab it was started on', () => {
    for (const tab of ['home', 'library', 'tools', 'settings'] as const) {
      const nav = walk(initialNav(tab), 'review');
      const { step } = pressBack(nav, { sessionPageCount: 3 });
      expect(step).toEqual({ kind: 'confirmDiscard', count: 3, then: 'pop' });
      // What AppNavigator does on "Discard": pop.
      expect(topEntry(pop(nav)).screen).toBe(tab);
    }
    // An empty Review (a cancelled import) just pops.
    expect(pressBack(walk(home, 'review')).step).toEqual({ kind: 'pop', actions: [] });
  });

  it('§9 O2: the introduction exits on first run and returns to Settings when opened from there', () => {
    // First run: the boot screen, alone on its stack.
    const firstRun = replace(initialNav('home'), 'onboarding', 'intro');
    expect(pressBack(firstRun).step).toEqual({ kind: 'exit' });
    expect(topEntry(pressBack(walk(initialNav('settings'), 'onboarding')).nav).screen).toBe('settings');
  });
});

describe('§14 Q7 cover target', () => {
  it('clears the target when leaving Academic options', () => {
    expect(resolveBack(ctx({ screen: 'academicOptions', tab: 'library', canPop: true, coverTarget: { from: 'library' } }))).toEqual({
      kind: 'go',
      to: 'library',
      actions: [{ type: 'deliver/SET_COVER_TARGET', target: null }],
    });
    // The scan session's options: nothing to clear.
    expect(resolveBack(ctx({ screen: 'academicOptions', tab: 'home', canPop: true }))).toEqual({ kind: 'pop', actions: [] });
  });

  it('returns to the list it was started from, past a Pro detour', () => {
    const nav = walk(initialNav('library'), 'academicOptions', 'pro');
    const afterPro = pressBack(nav).nav;
    expect(topEntry(afterPro).screen).toBe('academicOptions');
    const { nav: done } = pressBack(afterPro, { coverTarget: { from: 'library' } });
    expect(activeStack(done).map((e) => e.screen)).toEqual(['library']);
  });
});
