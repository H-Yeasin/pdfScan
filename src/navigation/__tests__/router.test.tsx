import { act, create } from 'react-test-renderer';
import { RouterProvider, useRouter } from '../router';

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

describe('router hubs', () => {
  it('Reader goes back to the course page it was opened from, the course page to its tab', () => {
    const router = mount();
    act(() => router().go('home'));
    act(() => router().go('course'));
    act(() => router().go('reader'));
    expect(router()).toMatchObject({ hub: 'course', tabHub: 'home' });

    act(() => router().go('library'));
    act(() => router().go('reader'));
    expect(router()).toMatchObject({ hub: 'library', tabHub: 'library' });
  });

  it('replace switches screen without a transition tick or history', () => {
    const router = mount();
    const tick = router().navTick;
    act(() => router().replace('home'));
    expect(router()).toMatchObject({ screen: 'home', previousScreen: null, navTick: tick, hub: 'home', tabHub: 'home' });
  });
});
