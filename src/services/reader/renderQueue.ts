// §18 W9: what the page surface renders next. The surface says what it wants right now (`want`,
// on every settle) and the queue works through it, most urgent first:
//  - the wanted set is replaced, not added to: a job that hasn't started and isn't wanted any more
//    is dropped, so a fling through 300 pages renders the pages it stops on, not the ones it passed;
//  - a job that is running is never interrupted (native code can't stop half-way through a page).
//    It finishes and its file stays in the cache, but its result is only handed back if the job
//    is still wanted by then;
//  - one key runs once at a time, however often it is wanted;
//  - each lane runs its own jobs side by side with the others': pdfium draws one page at a time
//    (one thread), and image decoding has a thread of its own.
// No React and no files here, so the order can be tested with a fake executor and clock.

export type RenderLane = 'pdf' | 'image';

export type QueueJob = {
  // What is rendered. Two jobs with the same key are the same work.
  key: string;
  lane: RenderLane;
  // Lower runs first. Jobs of one priority run in the order they were wanted.
  priority: number;
  // Start only once the job has been wanted for this long without a break (tiles wait for the
  // gesture to settle). While it waits, nothing less urgent starts on its lane: the lane must be
  // free the moment it is due.
  delayMs?: number;
};

// How many jobs of a lane run at once.
export const RENDER_LANES: Record<RenderLane, number> = { pdf: 1, image: 1 };

export type RenderQueueOptions<J extends QueueJob, R> = {
  run: (job: J) => Promise<R>;
  // Only for jobs still wanted when they end.
  onDone: (job: J, result: R) => void;
  onError?: (job: J, error: unknown) => void;
  // Asked just before a job would start: true when there's nothing to do (its result is already
  // held, or something better is).
  skip?: (job: J) => boolean;
  lanes?: Partial<Record<RenderLane, number>>;
};

export type RenderQueue<J extends QueueJob> = {
  // Replaces the wanted set. The order of `jobs` breaks ties between equal priorities.
  want: (jobs: readonly J[]) => void;
  // Nothing is wanted any more.
  clear: () => void;
  // For good: nothing starts and nothing is reported after this.
  dispose: () => void;
  stats: () => { waiting: number; running: number };
};

type Waiting<J> = { job: J; order: number; readyAt: number };

const LANES: readonly RenderLane[] = ['pdf', 'image'];

export function createRenderQueue<J extends QueueJob, R>(options: RenderQueueOptions<J, R>): RenderQueue<J> {
  const limits = { ...RENDER_LANES, ...options.lanes };
  const active: Record<RenderLane, number> = { pdf: 0, image: 0 };
  const running = new Set<string>();
  // Every key of the current set, running or not: what may still be reported.
  let wanted = new Set<string>();
  // The part of it that hasn't started.
  let waiting = new Map<string, Waiting<J>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const finish = (job: J, report: () => void) => {
    running.delete(job.key);
    active[job.lane] -= 1;
    if (disposed) return;
    if (wanted.has(job.key)) {
      // Wanted again while it ran: it is done now, whatever the outcome.
      waiting.delete(job.key);
      report();
    }
    pump();
  };

  const start = (job: J) => {
    running.add(job.key);
    active[job.lane] += 1;
    let work: Promise<R>;
    try {
      work = options.run(job);
    } catch (error) {
      work = Promise.reject(error);
    }
    work.then(
      (result) => finish(job, () => options.onDone(job, result)),
      (error) => finish(job, () => options.onError?.(job, error))
    );
  };

  function pump() {
    if (disposed) return;
    stopTimer();
    const now = Date.now();
    let wakeAt = Infinity;
    const queue = [...waiting.values()].sort((a, b) => a.job.priority - b.job.priority || a.order - b.order);
    const held: Partial<Record<RenderLane, boolean>> = {};
    for (const item of queue) {
      const { job } = item;
      if (running.has(job.key)) continue;
      if (held[job.lane] || active[job.lane] >= limits[job.lane]) continue;
      if (options.skip?.(job)) {
        waiting.delete(job.key);
        continue;
      }
      if (item.readyAt > now) {
        held[job.lane] = true;
        wakeAt = Math.min(wakeAt, item.readyAt);
        continue;
      }
      waiting.delete(job.key);
      start(job);
    }
    if (wakeAt !== Infinity) timer = setTimeout(pump, Math.max(0, wakeAt - now));
  }

  const want = (jobs: readonly J[]) => {
    if (disposed) return;
    const now = Date.now();
    const next = new Map<string, Waiting<J>>();
    jobs.forEach((job, order) => {
      const same = next.get(job.key);
      // Wanted twice in one set (visible and prefetched): the more urgent one counts.
      if (same && same.job.priority <= job.priority) return;
      // A job that was already waiting keeps its clock: the same tile wanted again after a small
      // move must not start its delay over.
      const before = waiting.get(job.key);
      const readyAt = now + (job.delayMs ?? 0);
      next.set(job.key, { job, order: same?.order ?? order, readyAt: before ? Math.min(before.readyAt, readyAt) : readyAt });
    });
    wanted = new Set(next.keys());
    waiting = next;
    pump();
  };

  return {
    want,
    clear: () => want([]),
    dispose: () => {
      disposed = true;
      stopTimer();
      wanted = new Set();
      waiting = new Map();
    },
    // A running job that is wanted again stays in `waiting` until it ends; it isn't waiting.
    stats: () => ({ waiting: [...waiting.keys()].filter((key) => !running.has(key)).length, running: running.size }),
  };
}
