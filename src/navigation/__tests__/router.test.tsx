import { act, create } from 'react-test-renderer';
import { RouterProvider, useRouter } from '../router';
import { activeStack } from '../navStack';

function mount() {
  let router: ReturnType<typeof useRouter> | null = null;
  function Probe() {
    router = useRouter();
    return null;
  }
  act(() => {
    create(
      <RouterProvider>
        <Probe />
      </RouterProvider>
    );
  });
  return () => router!;
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
    act(() => router().go('settings'));
    expect(router().transition).toMatchObject({ kind: 'slide', dir: 'fwd', from: { screen: 'home' } });
    const tick = router().navTick;
    act(() => router().back());
    expect(router().transition).toMatchObject({ kind: 'slide', dir: 'back', from: { screen: 'settings' } });
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
});
