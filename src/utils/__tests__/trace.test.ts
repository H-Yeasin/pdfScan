// §19 X1. The jest mock of modules/pdf-native has no trace functions (like iOS, or a build made
// before X1). Each test loads trace.ts afresh, with the functions it needs added to that load's
// copy of the mock.
type TraceFns = {
  traceBegin?: jest.Mock;
  traceEnd?: jest.Mock;
  traceMark?: jest.Mock;
  reportFullyDrawn?: jest.Mock;
};

function load(fns: TraceFns = {}): typeof import('../trace') {
  let mod: typeof import('../trace') | undefined;
  jest.isolateModules(() => {
    const native = (require('../../../modules/pdf-native') as { default: object }).default;
    Object.assign(native, fns);
    mod = require('../trace') as typeof import('../trace');
  });
  return mod!;
}

describe('trace', () => {
  it('does nothing without the native functions', async () => {
    const trace = load();
    expect(() => trace.traceMark('boot.firstScreen')).not.toThrow();
    const end = trace.traceBegin('save');
    expect(() => end()).not.toThrow();
    await expect(trace.traced('save', async () => 7)).resolves.toBe(7);
    expect(() => trace.reportFullyDrawn()).not.toThrow();
  });

  it('prefixes names, and gives overlapping stretches their own cookies', () => {
    const fns = { traceBegin: jest.fn(), traceEnd: jest.fn(), traceMark: jest.fn() };
    const trace = load(fns);
    trace.traceMark('nav.reader');
    expect(fns.traceMark).toHaveBeenCalledWith('pdfscan.nav.reader');

    const endA = trace.traceBegin('scan.page');
    const endB = trace.traceBegin('scan.page');
    const [, cookieA] = fns.traceBegin.mock.calls[0];
    const [, cookieB] = fns.traceBegin.mock.calls[1];
    expect(cookieA).not.toBe(cookieB);
    endA();
    endB();
    expect(fns.traceEnd.mock.calls).toEqual([
      ['pdfscan.scan.page', cookieA],
      ['pdfscan.scan.page', cookieB],
    ]);
  });

  it('ends a stretch once, however often it is ended', () => {
    const fns = { traceBegin: jest.fn(), traceEnd: jest.fn() };
    const end = load(fns).traceBegin('save');
    end();
    end();
    expect(fns.traceEnd).toHaveBeenCalledTimes(1);
  });

  it('ends a traced stretch when the work fails, and passes the error on', async () => {
    const fns = { traceBegin: jest.fn(), traceEnd: jest.fn() };
    const trace = load(fns);
    await expect(
      trace.traced('save', async () => {
        throw new Error('disk full');
      })
    ).rejects.toThrow('disk full');
    expect(fns.traceEnd).toHaveBeenCalledTimes(1);
  });

  it('never throws when the native side does', () => {
    const fail = () => {
      throw new Error('native');
    };
    const fns = { traceBegin: jest.fn(fail), traceEnd: jest.fn(), traceMark: jest.fn(fail) };
    const trace = load(fns);
    expect(() => trace.traceMark('boot.usable')).not.toThrow();
    const end = trace.traceBegin('save');
    end();
    // A stretch that never began is never ended.
    expect(fns.traceEnd).not.toHaveBeenCalled();
  });

  it('reports fully drawn once per process, with a mark', () => {
    const fns = { traceMark: jest.fn(), reportFullyDrawn: jest.fn(async () => {}) };
    const trace = load(fns);
    trace.reportFullyDrawn();
    trace.reportFullyDrawn();
    expect(fns.reportFullyDrawn).toHaveBeenCalledTimes(1);
    expect(fns.traceMark).toHaveBeenCalledWith('pdfscan.boot.usable');
  });
});
