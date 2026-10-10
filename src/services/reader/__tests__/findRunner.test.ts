import { createFindRunner } from '../findRunner';

// A search whose answers are resolved by hand, in any order.
function manualSearch() {
  const pending = new Map<string, { resolve: (hits: string[]) => void; reject: (e: Error) => void }>();
  const search = jest.fn(
    (query: string) =>
      new Promise<string[]>((resolve, reject) => {
        pending.set(query, { resolve, reject });
      })
  );
  return {
    search,
    resolve: (query: string, hits: string[]) => pending.get(query)!.resolve(hits),
    reject: (query: string) => pending.get(query)!.reject(new Error(`search failed: ${query}`)),
  };
}

describe('createFindRunner (§18 W2)', () => {
  it('hands back the results of a lone search', async () => {
    const { search, resolve } = manualSearch();
    const runner = createFindRunner(search);
    const run = runner.run('cell');
    resolve('cell', ['p1', 'p4']);
    await expect(run).resolves.toEqual(['p1', 'p4']);
    expect(search).toHaveBeenCalledWith('cell');
  });

  it('drops an older search that resolves after a newer one', async () => {
    const { search, resolve } = manualSearch();
    const runner = createFindRunner(search);
    const first = runner.run('ph');
    const second = runner.run('photosynthesis');
    resolve('photosynthesis', ['p7']);
    resolve('ph', ['p1', 'p2', 'p3']);
    await expect(second).resolves.toEqual(['p7']);
    await expect(first).resolves.toBeNull();
  });

  it('drops an older search that resolves before the newer one', async () => {
    const { search, resolve } = manualSearch();
    const runner = createFindRunner(search);
    const first = runner.run('ph');
    const second = runner.run('photosynthesis');
    resolve('ph', ['p1', 'p2', 'p3']);
    await expect(first).resolves.toBeNull();
    resolve('photosynthesis', ['p7']);
    await expect(second).resolves.toEqual(['p7']);
  });

  it('ignores a result that arrives after close', async () => {
    const { search, resolve } = manualSearch();
    const runner = createFindRunner(search);
    const run = runner.run('cell');
    runner.close();
    resolve('cell', ['p1']);
    await expect(run).resolves.toBeNull();
  });

  it('runs again after close', async () => {
    const { search, resolve } = manualSearch();
    const runner = createFindRunner(search);
    const stale = runner.run('cell');
    runner.close();
    const fresh = runner.run('wall');
    resolve('cell', ['p1']);
    resolve('wall', ['p2']);
    await expect(stale).resolves.toBeNull();
    await expect(fresh).resolves.toEqual(['p2']);
  });

  it('rejects when the newest search fails, and swallows a stale failure', async () => {
    const { search, resolve, reject } = manualSearch();
    const runner = createFindRunner(search);
    const stale = runner.run('ph');
    const current = runner.run('photo');
    reject('ph');
    await expect(stale).resolves.toBeNull();
    resolve('photo', ['p3']);
    await expect(current).resolves.toEqual(['p3']);

    const failing = runner.run('zz');
    reject('zz');
    await expect(failing).rejects.toThrow('search failed: zz');
  });
});
