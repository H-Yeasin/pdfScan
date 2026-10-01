import * as Sentry from '@sentry/react-native';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  close: jest.fn(async () => true),
  captureException: jest.fn(),
}));

type CrashModule = typeof import('../crash');

// Fresh module per test so the "active" flag starts off.
function loadCrash(): CrashModule {
  let mod!: CrashModule;
  jest.isolateModules(() => {
    mod = require('../crash');
  });
  return mod;
}

beforeEach(() => jest.clearAllMocks());

describe('crash reporting toggle', () => {
  it('never initializes while the toggle is off', () => {
    const crash = loadCrash();
    crash.initCrashReporting(false, 'https://key@sentry.example/1');
    crash.reportCrash(new Error('x'));
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('stays off without a DSN even when enabled', () => {
    const crash = loadCrash();
    crash.initCrashReporting(true, undefined);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes once with PII off, and closes when turned off', () => {
    const crash = loadCrash();
    crash.initCrashReporting(true, 'https://key@sentry.example/1');
    crash.initCrashReporting(true, 'https://key@sentry.example/1');
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Sentry.init).mock.calls[0][0]).toMatchObject({
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
    });

    crash.reportCrash(new Error('boom'));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    crash.initCrashReporting(false);
    expect(Sentry.close).toHaveBeenCalledTimes(1);
    crash.reportCrash(new Error('after'));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('scrubbers', () => {
  const crash = loadCrash();

  it('drops console and navigation breadcrumbs', () => {
    expect(crash.scrubBreadcrumb({ category: 'console', message: 'OCR: Rahim lab report' })).toBeNull();
    expect(crash.scrubBreadcrumb({ category: 'navigation', data: { to: 'reader' } })).toBeNull();
  });

  it('strips local paths and data from the breadcrumbs it keeps', () => {
    expect(
      crash.scrubBreadcrumb({ category: 'touch', message: 'tap file:///data/user/0/x/library/doc_1/page_1.jpg', data: { a: 1 } })
    ).toEqual({ category: 'touch', message: 'tap <path>', data: undefined });
  });

  it('removes extra, user, device names and file paths from events', () => {
    const scrubbed = crash.scrubEvent({
      type: undefined,
      message: 'Failed to read content://media/external/images/42',
      extra: { docName: 'Rahim_CSE101_HW3' },
      user: { id: 'u' },
      contexts: { app: { device_name: "Rahim's phone", app_version: '1.0' }, device: { name: "Rahim's phone", model: 'Pixel' } },
      exception: { values: [{ type: 'Error', value: 'ENOENT file:///docs/Rahim/secret.pdf' }] },
      breadcrumbs: [{ category: 'console', message: 'x' }, { category: 'ui', message: 'ok' }],
    });

    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.message).toBe('Failed to read <path>');
    expect(scrubbed.contexts?.app).toEqual({ device_name: undefined, app_version: '1.0' });
    expect(scrubbed.contexts?.device).toEqual({ name: undefined, model: 'Pixel' });
    expect(scrubbed.exception?.values?.[0].value).toBe('ENOENT <path>');
    expect(scrubbed.breadcrumbs).toEqual([{ category: 'ui', message: 'ok', data: undefined }]);
    expect(JSON.stringify(scrubbed)).not.toMatch(/Rahim|file:\/\/|content:\/\//);
  });
});
