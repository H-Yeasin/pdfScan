import { resolveBack, type BackContext, type BackStep } from '../backHandling';
import { activeStack, initialNav, pop, replace, resolveGo, topEntry, type NavState } from '../navStack';
import type { ScreenName } from '../../types/navigation';

const base: BackContext = {
  screen: 'home',
  tab: 'home',
  canPop: false,
  hasCourses: true,
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
    expect(back(walk(home, 'settings', 'manageFolders'))).toBe('settings');
    // §10 M6: Pro is a plain push, so Back returns to the screen it was opened from.
    expect(back(walk(initialNav('capture'), 'review', 'academicOptions', 'pro'))).toBe('academicOptions');
    expect(back(walk(home, 'course', 'examPack'))).toBe('course');
  });

  it('Settings opened from Capture goes back to Capture', () => {
    const { nav } = pressBack(walk(initialNav('capture'), 'settings'));
    expect(nav.tab).toBe('capture');
    expect(activeStack(nav).map((e) => e.screen)).toEqual(['capture']);
  });

  it('Storage opened by the low-space guard goes back to the screen that opened it', () => {
    // useSpaceGuard, from a document in the Library: no Settings in between.
    const nav = walk(initialNav('library'), 'reader', 'storage');
    expect(topEntry(pressBack(nav).nav).screen).toBe('reader');
    // From Settings → Storage, it's Settings.
    expect(topEntry(pressBack(walk(home, 'settings', 'storage')).nav).screen).toBe('settings');
  });

  it('keeps the scan flow’s fixed steps back', () => {
    const to = (patch: Partial<BackContext>) => {
      const step = resolveBack(ctx({ canPop: true, tab: 'capture', ...patch }));
      return step.kind === 'go' ? step.to : step.kind;
    };
    expect(to({ screen: 'review' })).toBe('capture');
    expect(to({ screen: 'deliver' })).toBe('review');
    // The scan session's Academic options: back to wherever they were opened (Review or Deliver).
    expect(to({ screen: 'academicOptions' })).toBe('pop');
    // §14 Q7: set up for a library document's cover, back where that started.
    expect(to({ screen: 'academicOptions', coverTarget: { from: 'reader' } })).toBe('reader');
    expect(to({ screen: 'academicOptions', coverTarget: { from: 'course' } })).toBe('course');
  });

  it('does the screen’s Back clean-up on the way out', () => {
    expect(resolveBack(ctx({ screen: 'review', tab: 'capture', canPop: true, retakeTargetId: 'p1' }))).toEqual({
      kind: 'go',
      to: 'capture',
      actions: [{ type: 'capture/SET_RETAKE_TARGET', id: null }],
    });
    expect(resolveBack(ctx({ screen: 'course', canPop: true, highlightDeadlineId: 'd1' }))).toEqual({
      kind: 'pop',
      actions: [{ type: 'libraryUi/SET_HIGHLIGHT_DEADLINE', id: null }],
    });
  });

  it('on a root: to the start tab from another tab, out of the app from the start tab', () => {
    expect(resolveBack(ctx({ screen: 'home' }))).toEqual({ kind: 'exit' });
    expect(resolveBack(ctx({ screen: 'capture', tab: 'capture', hasCourses: false }))).toEqual({ kind: 'exit' });
    expect(resolveBack(ctx({ screen: 'library', tab: 'library', hasCourses: false }))).toEqual({ kind: 'go', to: 'capture', actions: [] });
    expect(resolveBack(ctx({ screen: 'home', hasCourses: false }))).toEqual({ kind: 'go', to: 'capture', actions: [] });
    // Applied: the Library tab's root goes to Home's.
    const { nav } = pressBack(initialNav('library'));
    expect(nav.tab).toBe('home');
    expect(topEntry(nav).screen).toBe('home');
  });

  it('asks before exiting with an unsaved scan', () => {
    expect(resolveBack(ctx({ screen: 'capture', tab: 'capture', hasCourses: false, sessionPageCount: 8 }))).toEqual({
      kind: 'confirmDiscard',
      count: 8,
    });
    // Leaving Capture for Home keeps the pages, so no question there.
    expect(resolveBack(ctx({ screen: 'capture', tab: 'capture', sessionPageCount: 8 })).kind).toBe('go');
  });

  it('§9 O2: the introduction exits on first run and returns to Settings when opened from there', () => {
    // First run: the boot screen, alone on its stack.
    const firstRun = replace(initialNav('capture'), 'onboarding', 'intro');
    expect(pressBack(firstRun).step).toEqual({ kind: 'exit' });
    expect(topEntry(pressBack(walk(home, 'settings', 'onboarding')).nav).screen).toBe('settings');
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
    expect(resolveBack(ctx({ screen: 'academicOptions', tab: 'capture', canPop: true }))).toEqual({ kind: 'pop', actions: [] });
  });

  it('returns to the list it was started from, past a Pro detour', () => {
    const nav = walk(initialNav('library'), 'academicOptions', 'pro');
    const afterPro = pressBack(nav).nav;
    expect(topEntry(afterPro).screen).toBe('academicOptions');
    const { nav: done } = pressBack(afterPro, { coverTarget: { from: 'library' } });
    expect(activeStack(done).map((e) => e.screen)).toEqual(['library']);
  });
});
