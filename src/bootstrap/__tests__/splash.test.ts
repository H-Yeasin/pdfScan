import * as SplashScreen from 'expo-splash-screen';
import { holdSplash, releaseSplash, SPLASH_TIMEOUT_MS } from '../splash';

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(() => Promise.resolve(true)), hide: jest.fn() }));

const preventAutoHideAsync = jest.mocked(SplashScreen.preventAutoHideAsync);
const hide = jest.mocked(SplashScreen.hide);

describe('splash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    preventAutoHideAsync.mockClear();
    hide.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('hides when the app is ready, once', () => {
    holdSplash();
    expect(preventAutoHideAsync).toHaveBeenCalledTimes(1);
    releaseSplash();
    releaseSplash();
    jest.advanceTimersByTime(SPLASH_TIMEOUT_MS);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('hides after the safety timeout when loading never finishes', () => {
    holdSplash();
    jest.advanceTimersByTime(SPLASH_TIMEOUT_MS - 1);
    expect(hide).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('never throws when the native module is missing', () => {
    hide.mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    holdSplash();
    expect(() => releaseSplash()).not.toThrow();
  });
});
