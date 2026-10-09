import * as SplashScreen from 'expo-splash-screen';
import { holdSplash, releaseSplash, SPLASH_EXIT_MS, SPLASH_TIMEOUT_MS } from '../splash';

jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(() => Promise.resolve(true)), hide: jest.fn(), setOptions: jest.fn() }));

const preventAutoHideAsync = jest.mocked(SplashScreen.preventAutoHideAsync);
const hide = jest.mocked(SplashScreen.hide);
const setOptions = jest.mocked(SplashScreen.setOptions);

describe('splash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    preventAutoHideAsync.mockClear();
    hide.mockClear();
    setOptions.mockClear();
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

  // §15 V5: the native splash fades out over the splash intro's identical frame. Android applies
  // options later on the main queue, so they must be set long before hide().
  it('sets the short fade-out when it holds, before anything hides', () => {
    holdSplash();
    expect(setOptions).toHaveBeenCalledWith({ duration: SPLASH_EXIT_MS, fade: true });
    expect(setOptions.mock.invocationCallOrder[0]).toBeLessThan(preventAutoHideAsync.mock.invocationCallOrder[0]);
    releaseSplash();
    expect(setOptions.mock.invocationCallOrder[0]).toBeLessThan(hide.mock.invocationCallOrder[0]);
  });

  it('still holds when setting the fade throws (an old dev build)', () => {
    setOptions.mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    expect(() => holdSplash()).not.toThrow();
    expect(preventAutoHideAsync).toHaveBeenCalledTimes(1);
    releaseSplash();
  });

  it('never throws when the native module is missing', () => {
    hide.mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    holdSplash();
    expect(() => releaseSplash()).not.toThrow();
  });
});
