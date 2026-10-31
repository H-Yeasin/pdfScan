import { act, create } from 'react-test-renderer';
import { RouterProvider, useRouter } from '../router';
import { activeStack } from '../navStack';
import { AppStateProvider, useAppStore, type AppStore } from '../../store/AppStateContext';

let store: AppStore;

function mount() {
  let router: ReturnType<typeof useRouter> | null = null;
  function Probe() {
    router = useRouter();
    store = useAppStore();
    return null;
  }
  act(() => {
    create(
      <AppStateProvider>
        <RouterProvider>
          <Probe />
        </RouterProvider>
      </AppStateProvider>
    );
  });
  return () => router!;
}

// Opens a document the way the screens do: dispatch, then go().
function openDoc(router: () => ReturnType<typeof useRouter>, id: string) {
  act(() => {
    store.dispatch({ type: 'reader/SET_READER_ID', id });
    router().go('reader');
  });
}

const stack = (router: ReturnType<typeof useRouter>) => activeStack(router.nav).map((e) => e.screen);

describe('router (§16 G2)', () => {
  it('Back returns to where a screen was opened from', () => {
    const router = mount();
    act(() => router().replace('home'));
    act(() => router().go('course'));
    act(() => router().go('reader'));
    expect(stack(router())).toEqual(['home', 'course', 'reader']);
    act(() => router().back());
    expect(router().screen).toBe('course');
    act(() => router().back());
    expect(router().screen).toBe('home');
  });

  it('replace switches screen without a transition tick or history', () => {
    const router = mount();
    const tick = router().navTick;
    act(() => router().replace('home'));
    expect(router()).toMatchObject({ screen: 'home', tab: 'home', navTick: tick });
    expect(stack(router())).toEqual(['home']);
  });

  it('records each change of top screen for the transition', () => {
    const router = mount();
    act(() => router().replace('home'));
    act(() => router().go('storage'));
    expect(router().transition).toMatchObject({ kind: 'slide', dir: 'fwd', from: { screen: 'home' } });
    const tick = router().navTick;
    act(() => router().back());
    expect(router().transition).toMatchObject({ kind: 'slide', dir: 'back', from: { screen: 'storage' } });
    expect(router().navTick).toBe(tick + 1);
    act(() => router().switchTab('library'));
    expect(router().transition).toMatchObject({ kind: 'fade', from: { screen: 'home' } });
    // Nothing to do (the root already shows): no tick.
    const still = router().navTick;
    act(() => router().switchTab('library'));
    act(() => router().back());
    expect(router().navTick).toBe(still);
  });

  it("returns from Pro to the screen it was opened from with that screen's own Back intact (§10 M6)", () => {
    const router = mount();
    act(() => router().go('review'));
    act(() => router().go('academicOptions'));
    act(() => router().go('pro'));
    act(() => router().back());
    expect(router().screen).toBe('academicOptions');
    // Academic options' Back still goes to Review, not to Pro.
    act(() => router().back());
    expect(router().screen).toBe('review');
  });

  it('Back puts the revealed Reader’s own document back in the store', () => {
    const router = mount();
    act(() => router().replace('library'));
    openDoc(router, 'A');
    act(() => {
      store.dispatch({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'C' });
      router().go('course');
    });
    openDoc(router, 'B');
    expect(stack(router())).toEqual(['library', 'reader', 'course', 'reader']);
    act(() => store.dispatch({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'D' }));
    act(() => router().back());
    expect(router().screen).toBe('course');
    expect(store.getState().libraryUi.activeCourseId).toBe('C');
    act(() => router().back());
    expect(router().screen).toBe('reader');
    expect(store.getState().reader.readerId).toBe('A');
  });

  it('a tab switch restores the course page that tab shows', () => {
    const router = mount();
    act(() => router().replace('home'));
    act(() => {
      store.dispatch({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'C' });
      router().go('course');
    });
    act(() => router().switchTab('library'));
    act(() => {
      store.dispatch({ type: 'libraryUi/SET_ACTIVE_COURSE', id: 'D' });
      router().go('course');
    });
    act(() => router().switchTab('home'));
    expect(router().screen).toBe('course');
    expect(store.getState().libraryUi.activeCourseId).toBe('C');
    // Back on Files' root returns here through the trail.
    act(() => router().switchTab('library'));
    act(() => router().back());
    act(() => router().backToTab());
    expect(router()).toMatchObject({ tab: 'home', screen: 'course' });
  });

  it('syncTopSubject: the entry on top takes on a subject changed without go()', () => {
    const router = mount();
    act(() => router().replace('library'));
    act(() => {
      store.dispatch({ type: 'reader/SET_EXTERNAL', doc: { uri: 'file:///x.pdf', name: 'x.pdf', format: 'PDF', sizeBytes: 1, sourceUri: 'content://x', importedAt: 1 } });
      router().go('reader');
    });
    const key = activeStack(router().nav)[1].key;
    // "Add to Library".
    act(() => store.dispatch({ type: 'reader/SET_READER_ID', id: 'P' }));
    act(() => router().syncTopSubject());
    expect(activeStack(router().nav)[1]).toEqual({ key, screen: 'reader', subject: { kind: 'doc', id: 'P' } });
  });
});
