import { act, create } from 'react-test-renderer';
import { BOOT_DEFER_MS, useDeferredBoot } from '../useDeferredBoot';

function mount(ready: boolean) {
  let value = false;
  function Probe({ ready: r }: { ready: boolean }) {
    value = useDeferredBoot(r);
    return null;
  }
  let root: ReturnType<typeof create>;
  act(() => {
    root = create(<Probe ready={ready} />);
  });
  return { get: () => value, setReady: (r: boolean) => act(() => root.update(<Probe ready={r} />)) };
}

describe('useDeferredBoot', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits for the first screen, then a moment more, and still runs the deferred work', () => {
    const probe = mount(false);
    act(() => jest.advanceTimersByTime(BOOT_DEFER_MS * 2));
    expect(probe.get()).toBe(false);

    probe.setReady(true);
    act(() => jest.advanceTimersByTime(BOOT_DEFER_MS - 1));
    expect(probe.get()).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(probe.get()).toBe(true);
  });

  it('stays true once set', () => {
    const probe = mount(true);
    act(() => jest.advanceTimersByTime(BOOT_DEFER_MS));
    probe.setReady(false);
    expect(probe.get()).toBe(true);
  });
});
