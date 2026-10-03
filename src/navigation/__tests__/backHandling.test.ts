import { resolveBack, type BackContext } from '../backHandling';

const base: BackContext = {
  screen: 'home',
  previousScreen: null,
  hub: 'home',
  tabHub: 'home',
  hasCourses: true,
  selMode: false,
  searchOpen: false,
  sessionPageCount: 0,
  retakeTargetId: null,
  highlightDeadlineId: null,
};
const ctx = (patch: Partial<BackContext>): BackContext => ({ ...base, ...patch });

describe('resolveBack order', () => {
  it('leaves selection before anything else', () => {
    expect(resolveBack(ctx({ screen: 'course', selMode: true, tabHub: 'library' }))).toEqual({
      kind: 'dispatch',
      actions: [{ type: 'library/CLEAR_SELECTION' }],
    });
    // Even on the root tab: selection first, exit only on the next press.
    expect(resolveBack(ctx({ screen: 'home', selMode: true })).kind).toBe('dispatch');
  });

  it('closes Library search, then goes back to the root tab', () => {
    expect(resolveBack(ctx({ screen: 'library', searchOpen: true }))).toEqual({
      kind: 'dispatch',
      actions: [{ type: 'library/TOGGLE_SEARCH_OPEN' }],
    });
    expect(resolveBack(ctx({ screen: 'library' }))).toEqual({ kind: 'go', to: 'home', actions: [] });
  });

  it('ignores a stale selection on screens without a document list', () => {
    expect(resolveBack(ctx({ screen: 'reader', selMode: true, hub: 'library' }))).toEqual({
      kind: 'go',
      to: 'library',
      actions: [],
    });
  });

  it('goes where each screen’s own Back button goes', () => {
    const to = (patch: Partial<BackContext>) => {
      const step = resolveBack(ctx(patch));
      return step.kind === 'go' ? step.to : step.kind;
    };
    expect(to({ screen: 'review' })).toBe('capture');
    expect(to({ screen: 'deliver' })).toBe('review');
    expect(to({ screen: 'course', tabHub: 'library' })).toBe('library');
    expect(to({ screen: 'reader', hub: 'course' })).toBe('course');
    expect(to({ screen: 'settings', hub: 'library' })).toBe('library');
    expect(to({ screen: 'storage' })).toBe('settings');
    expect(to({ screen: 'backup' })).toBe('settings');
    expect(to({ screen: 'onboarding', previousScreen: 'settings' })).toBe('settings');
    // First run: Back on the introduction's first page leaves the app.
    expect(to({ screen: 'onboarding' })).toBe('exit');
    expect(to({ screen: 'manageFolders' })).toBe('settings');
    expect(to({ screen: 'academicOptions', previousScreen: 'review' })).toBe('review');
    expect(to({ screen: 'academicOptions' })).toBe('deliver');
    // §10 M6: Pro goes back to where it was opened from.
    expect(to({ screen: 'pro', previousScreen: 'academicOptions' })).toBe('academicOptions');
    expect(to({ screen: 'pro' })).toBe('settings');
    expect(to({ screen: 'examPack', previousScreen: 'home' })).toBe('home');
    expect(to({ screen: 'capture' })).toBe('home');
  });

  it('does the screen’s Back clean-up on the way out', () => {
    expect(resolveBack(ctx({ screen: 'review', retakeTargetId: 'p1' }))).toEqual({
      kind: 'go',
      to: 'capture',
      actions: [{ type: 'capture/SET_RETAKE_TARGET', id: null }],
    });
    expect(resolveBack(ctx({ screen: 'course', highlightDeadlineId: 'd1' }))).toEqual({
      kind: 'go',
      to: 'home',
      actions: [{ type: 'library/SET_HIGHLIGHT_DEADLINE', id: null }],
    });
  });

  it('exits only from the root tab: Home with courses, Capture without', () => {
    expect(resolveBack(ctx({ screen: 'home' }))).toEqual({ kind: 'exit' });
    expect(resolveBack(ctx({ screen: 'capture', hasCourses: false }))).toEqual({ kind: 'exit' });
    expect(resolveBack(ctx({ screen: 'library', hasCourses: false }))).toEqual({ kind: 'go', to: 'capture', actions: [] });
    expect(resolveBack(ctx({ screen: 'home', hasCourses: false }))).toEqual({ kind: 'go', to: 'capture', actions: [] });
  });

  it('asks before exiting with an unsaved scan', () => {
    expect(resolveBack(ctx({ screen: 'capture', hasCourses: false, sessionPageCount: 8 }))).toEqual({
      kind: 'confirmDiscard',
      count: 8,
    });
    // Leaving Capture for Home keeps the pages, so no question there.
    expect(resolveBack(ctx({ screen: 'capture', sessionPageCount: 8 })).kind).toBe('go');
  });
});
