import { runTask, TaskCancelledError, type TaskEvents } from '../task';

// §17 U13: the task toast's state machine, without React or the store.
function recorder() {
  const log: string[] = [];
  let cancel: (() => void) | undefined;
  const events: TaskEvents = {
    start: (c) => {
      cancel = c;
      log.push(c ? 'start(cancellable)' : 'start');
    },
    progress: (done, total) => log.push(`${done}/${total}`),
    end: () => log.push('end'),
  };
  return { log, events, cancel: () => cancel?.() };
}

describe('runTask (§17 U13)', () => {
  it('starts, reports progress, ends, and hands back the value', async () => {
    const { log, events } = recorder();
    const result = await runTask(
      async (task) => {
        for (let i = 1; i <= 3; i++) task.progress(i, 3);
        return 'merged';
      },
      events
    );
    expect(result).toEqual({ status: 'done', value: 'merged' });
    expect(log).toEqual(['start', '1/3', '2/3', '3/3', 'end']);
  });

  it('keeps progress in range and ignores a job that counts nothing', async () => {
    const { log, events } = recorder();
    await runTask(async (task) => {
      task.progress(7, 5);
      task.progress(-1, 5);
      task.progress(1, 0);
    }, events);
    expect(log).toEqual(['start', '5/5', '0/5', 'end']);
  });

  it('stops between steps on Cancel, and says nothing more after it', async () => {
    const { log, events, cancel } = recorder();
    const done: number[] = [];
    const result = await runTask(
      async (task) => {
        for (let i = 1; i <= 5; i++) {
          task.throwIfCancelled();
          done.push(i);
          task.progress(i, 5);
          if (i === 2) {
            cancel();
            // The step under way finishing late: not shown.
            task.progress(3, 5);
          }
        }
      },
      events,
      true
    );
    expect(result).toEqual({ status: 'cancelled' });
    expect(done).toEqual([1, 2]);
    expect(log).toEqual(['start(cancellable)', '1/5', '2/5', 'end']);
  });

  it('offers no Cancel unless asked', async () => {
    const { log, events } = recorder();
    await runTask(async () => undefined, events);
    expect(log[0]).toBe('start');
  });

  it('ends on a failure too, with the error', async () => {
    const { log, events } = recorder();
    const boom = new Error('boom');
    const result = await runTask(async () => {
      throw boom;
    }, events);
    expect(result).toEqual({ status: 'failed', error: boom });
    expect(log).toEqual(['start', 'end']);
  });

  it('reads a TaskCancelledError as cancelled', async () => {
    const { events } = recorder();
    const result = await runTask(async () => {
      throw new TaskCancelledError();
    }, events);
    expect(result.status).toBe('cancelled');
  });
});
