// §17 U13: a long job (merge, split, compress, preparing a share) shown as a small toast where the
// snack sits: what is happening, "3 of 5" when the job counts, and Cancel when it can stop. When it
// ends the toast gives way to the result snack. This is the job's side, with no React and no store,
// so the order of events is tested on its own; components/ui/useTask.tsx wires it to the store.

// Thrown by `throwIfCancelled` once Cancel was tapped; runTask turns it into a 'cancelled' result.
export class TaskCancelledError extends Error {
  constructor() {
    super('Task cancelled');
    this.name = 'TaskCancelledError';
  }
}

// What a job gets. Cancelling is cooperative: the job checks between steps (a file, a page), where
// stopping leaves nothing half-written, and never in the middle of one.
export type TaskControl = {
  progress(done: number, total: number): void;
  readonly cancelled: boolean;
  throwIfCancelled(): void;
};

export type TaskResult<T> = { status: 'done'; value: T } | { status: 'cancelled' } | { status: 'failed'; error: unknown };

// What the toast hears, in this order: start once, progress any number of times, end once (always,
// a failure included).
export type TaskEvents = {
  start(cancel: (() => void) | undefined): void;
  progress(done: number, total: number): void;
  end(): void;
};

export async function runTask<T>(job: (task: TaskControl) => Promise<T>, events: TaskEvents, cancellable = false): Promise<TaskResult<T>> {
  let cancelled = false;
  let ended = false;
  const control: TaskControl = {
    progress(done, total) {
      // A job that keeps reporting after Cancel (its current step finishing) says nothing more.
      if (ended || cancelled || !(total > 0)) return;
      events.progress(Math.min(Math.max(0, Math.round(done)), total), total);
    },
    get cancelled() {
      return cancelled;
    },
    throwIfCancelled() {
      if (cancelled) throw new TaskCancelledError();
    },
  };
  events.start(
    cancellable
      ? () => {
          cancelled = true;
        }
      : undefined
  );
  try {
    const value = await job(control);
    // A job that saw Cancel too late to stop still finished: what it made is kept and said.
    return { status: 'done', value };
  } catch (error) {
    if (error instanceof TaskCancelledError || cancelled) return { status: 'cancelled' };
    return { status: 'failed', error };
  } finally {
    ended = true;
    events.end();
  }
}
