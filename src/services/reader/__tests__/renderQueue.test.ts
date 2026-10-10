import { createRenderQueue, type QueueJob, type RenderLane } from '../renderQueue';

type Job = QueueJob & { fail?: boolean };

const job = (key: string, priority: number, lane: RenderLane = 'pdf', delayMs?: number): Job => ({ key, lane, priority, delayMs });

// A fake executor: every started job waits until the test ends it.
function harness(options: { skip?: (job: Job) => boolean; lanes?: Partial<Record<RenderLane, number>> } = {}) {
  const started: string[] = [];
  const done: string[] = [];
  const failed: string[] = [];
  const open = new Map<string, { resolve: (value: string) => void; reject: (error: unknown) => void }>();
  const queue = createRenderQueue<Job, string>({
    run: (j) => {
      started.push(j.key);
      return new Promise<string>((resolve, reject) => open.set(j.key, { resolve, reject }));
    },
    onDone: (j, result) => done.push(`${j.key}=${result}`),
    onError: (j) => failed.push(j.key),
    ...options,
  });
  const end = async (key: string, error?: unknown) => {
    const handle = open.get(key);
    if (!handle) throw new Error(`${key} is not running`);
    open.delete(key);
    if (error) handle.reject(error);
    else handle.resolve(`${key}.jpg`);
    // Let the queue's `then` run.
    await Promise.resolve();
    await Promise.resolve();
  };
  return { queue, started, done, failed, end };
}

describe('§18 W9 render queue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs by priority, then in the order wanted, one at a time on a lane', async () => {
    const h = harness();
    h.queue.want([job('prefetch', 4), job('base-b', 1), job('tile', 3), job('base-a', 1)]);
    expect(h.started).toEqual(['base-b']);
    expect(h.queue.stats()).toEqual({ waiting: 3, running: 1 });
    await h.end('base-b');
    await h.end('base-a');
    await h.end('tile');
    await h.end('prefetch');
    expect(h.started).toEqual(['base-b', 'base-a', 'tile', 'prefetch']);
    expect(h.done).toEqual(['base-b=base-b.jpg', 'base-a=base-a.jpg', 'tile=tile.jpg', 'prefetch=prefetch.jpg']);
    expect(h.queue.stats()).toEqual({ waiting: 0, running: 0 });
  });

  it('gives each lane its own slot', async () => {
    const h = harness();
    h.queue.want([job('pdf-1', 1), job('pdf-2', 1), job('img-1', 2, 'image'), job('img-2', 2, 'image')]);
    expect(h.started).toEqual(['pdf-1', 'img-1']);
    await h.end('img-1');
    expect(h.started).toEqual(['pdf-1', 'img-1', 'img-2']);
    await h.end('pdf-1');
    expect(h.started).toEqual(['pdf-1', 'img-1', 'img-2', 'pdf-2']);
  });

  it('a lane can be given more slots', () => {
    const h = harness({ lanes: { image: 2 } });
    h.queue.want([job('a', 1, 'image'), job('b', 1, 'image'), job('c', 1, 'image')]);
    expect(h.started).toEqual(['a', 'b']);
  });

  it('runs a key once: twice in a set, and wanted again while it runs', async () => {
    const h = harness();
    h.queue.want([job('a', 4), job('a', 1), job('b', 2)]);
    expect(h.started).toEqual(['a']);
    h.queue.want([job('a', 1), job('b', 2)]);
    expect(h.started).toEqual(['a']);
    await h.end('a');
    expect(h.done).toEqual(['a=a.jpg']);
    expect(h.started).toEqual(['a', 'b']);
    await h.end('b');
    expect(h.started).toEqual(['a', 'b']);
  });

  it('the more urgent of two wants for one key counts', async () => {
    const h = harness();
    h.queue.want([job('first', 1), job('a', 4), job('b', 3), job('a', 2)]);
    await h.end('first');
    expect(h.started).toEqual(['first', 'a']);
  });

  it('drops jobs that are no longer wanted before they start', async () => {
    const h = harness();
    h.queue.want([job('a', 1), job('b', 1), job('c', 1)]);
    h.queue.want([job('d', 1)]);
    await h.end('a');
    await h.end('d');
    expect(h.started).toEqual(['a', 'd']);
    // `a` ran to its end, but nobody wanted it by then: not reported.
    expect(h.done).toEqual(['d=d.jpg']);
  });

  it('re-prioritises while a job runs', async () => {
    const h = harness();
    h.queue.want([job('a', 1), job('b', 2), job('c', 3)]);
    h.queue.want([job('c', 1), job('b', 2), job('a', 3)]);
    await h.end('a');
    // `a` was wanted again while it ran: reported, not run a second time.
    expect(h.done).toEqual(['a=a.jpg']);
    await h.end('c');
    await h.end('b');
    expect(h.started).toEqual(['a', 'c', 'b']);
  });

  it('asks `skip` just before starting', async () => {
    const held = new Set(['b']);
    const h = harness({ skip: (j) => held.has(j.key) });
    h.queue.want([job('a', 1), job('b', 2), job('c', 3)]);
    held.add('c');
    await h.end('a');
    expect(h.started).toEqual(['a']);
    expect(h.queue.stats()).toEqual({ waiting: 0, running: 0 });
  });

  it('reports a failure and goes on', async () => {
    const h = harness();
    h.queue.want([job('a', 1), job('b', 2)]);
    await h.end('a', new Error('no'));
    expect(h.failed).toEqual(['a']);
    expect(h.started).toEqual(['a', 'b']);
  });

  it('survives an executor that throws instead of rejecting', async () => {
    const failed: string[] = [];
    const queue = createRenderQueue<Job, string>({
      run: () => {
        throw new Error('sync');
      },
      onDone: () => undefined,
      onError: (j) => failed.push(j.key),
    });
    queue.want([job('a', 1)]);
    await Promise.resolve();
    await Promise.resolve();
    expect(failed).toEqual(['a']);
  });

  it('starts a delayed job only after it was wanted that long, and holds its lane meanwhile', async () => {
    const h = harness();
    h.queue.want([job('tile', 3, 'pdf', 150), job('prefetch', 4), job('scan', 4, 'image')]);
    // The pdf lane waits for the tile; the image lane has nothing to wait for.
    expect(h.started).toEqual(['scan']);
    jest.advanceTimersByTime(149);
    expect(h.started).toEqual(['scan']);
    jest.advanceTimersByTime(1);
    expect(h.started).toEqual(['scan', 'tile']);
    await h.end('tile');
    expect(h.started).toEqual(['scan', 'tile', 'prefetch']);
  });

  it('a delayed job that stays wanted keeps its clock; one that left starts over', () => {
    const h = harness();
    h.queue.want([job('t1', 3, 'pdf', 150), job('t2', 3, 'image', 150)]);
    jest.advanceTimersByTime(100);
    h.queue.want([job('t1', 3, 'pdf', 150)]);
    jest.advanceTimersByTime(50);
    expect(h.started).toEqual(['t1']);
    h.queue.want([job('t1', 3, 'pdf', 150), job('t2', 3, 'image', 150)]);
    jest.advanceTimersByTime(100);
    expect(h.started).toEqual(['t1']);
    jest.advanceTimersByTime(50);
    expect(h.started).toEqual(['t1', 't2']);
  });

  it('a delayed job that is dropped never starts', () => {
    const h = harness();
    h.queue.want([job('tile', 3, 'pdf', 150)]);
    jest.advanceTimersByTime(100);
    h.queue.clear();
    jest.advanceTimersByTime(500);
    expect(h.started).toEqual([]);
  });

  it('after dispose nothing starts and nothing is reported', async () => {
    const h = harness();
    h.queue.want([job('a', 1), job('b', 1), job('t', 3, 'image', 150)]);
    h.queue.dispose();
    await h.end('a');
    jest.advanceTimersByTime(500);
    h.queue.want([job('c', 1)]);
    expect(h.started).toEqual(['a']);
    expect(h.done).toEqual([]);
  });
});
