import { act, create } from 'react-test-renderer';
import { resetRenderCounts, setRenderCountsShown, useRenderCount, useRenderCounts } from '../renderCounts';

function Counted({ tick }: { tick: number }) {
  useRenderCount('Counted');
  return tick < 0 ? null : null;
}

let seen: Record<string, number> = {};
function Reader() {
  seen = { ...useRenderCounts() };
  return null;
}

describe('render counts (§16 G5, dev only)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => setRenderCountsShown(false));
    jest.useRealTimers();
  });

  it('counts nothing until shown, then each render, and resets', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        <>
          <Counted tick={0} />
          <Reader />
        </>
      );
    });
    act(() => jest.runOnlyPendingTimers());
    expect(seen).toEqual({});

    act(() => setRenderCountsShown(true));
    const again = (tick: number) =>
      act(() =>
        root.update(
          <>
            <Counted tick={tick} />
            <Reader />
          </>
        )
      );
    again(1);
    again(2);
    act(() => jest.runOnlyPendingTimers());
    expect(seen).toEqual({ Counted: 2 });

    act(() => resetRenderCounts());
    expect(seen).toEqual({});
  });
});
