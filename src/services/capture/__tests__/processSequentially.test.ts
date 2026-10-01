import { processSequentially } from '../processSequentially';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('processSequentially', () => {
  it('runs one item at a time and reports progress after each', async () => {
    let running = 0;
    let maxRunning = 0;
    const progress: [number, number][] = [];
    const result = await processSequentially(
      [1, 2, 3],
      async (n) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await tick();
        running--;
        return n * 10;
      },
      { onProgress: ({ done, total }) => progress.push([done, total]) }
    );
    expect(result).toEqual({ items: [10, 20, 30], cancelled: false });
    expect(maxRunning).toBe(1);
    expect(progress).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('stops between items when cancelled, keeping finished items and discarding the rest', async () => {
    const controller = new AbortController();
    const discarded: string[] = [];
    const result = await processSequentially(
      ['a', 'b', 'c', 'd'],
      async (input, index) => {
        if (index === 1) controller.abort(); // cancel arrives while page 2 is processing
        return input.toUpperCase();
      },
      { signal: controller.signal, discardInput: (input) => discarded.push(input) }
    );
    expect(result).toEqual({ items: ['A', 'B'], cancelled: true });
    expect(discarded).toEqual(['c', 'd']);
  });

  it('keeps finished items when a step fails and discards the failed and remaining inputs', async () => {
    const discarded: number[] = [];
    const error = new Error('decode failed');
    const result = await processSequentially(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw error;
        return n;
      },
      { discardInput: (n) => discarded.push(n) }
    );
    expect(result).toEqual({ items: [1], cancelled: false, error, failedIndex: 1 });
    expect(discarded).toEqual([2, 3]);
  });
});
