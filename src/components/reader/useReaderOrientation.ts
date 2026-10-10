import { useCallback, useEffect, useRef } from 'react';
import { Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

// How long to wait for the screen to have turned back before leaving anyway.
const TURN_WAIT_MS = 500;

function lockPortrait(): Promise<void> {
  // A device that can't lock (Android 16 on a large screen ignores it) is not an error here.
  return ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
}

// The window is upright again, or the wait is over.
function turnedUpright(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      if (window.height >= window.width) finish();
    });
    const timer = setTimeout(finish, TURN_WAIT_MS);
  });
}

// §18 W11 (A13): landscape in the Reader only. The app is portrait (`app.json`); while `enabled`
// the lock is lifted, so the page surface follows the phone as far as the user's auto-rotate
// allows, and it is put back when that ends (the Reader goes under another screen, a tool that
// is still portrait-only opens, the Reader closes).
//
// `leave(then)` is for the Reader's own Back: it turns the screen upright first and only then
// runs `then`, so the screen underneath is never seen sideways. The hardware Back goes through
// AppNavigator, which doesn't wait: there the lock is put back as the Reader stops being the
// screen on top.
export function useReaderOrientation(enabled: boolean) {
  const on = useRef(enabled);
  on.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => {
      void lockPortrait();
    };
  }, [enabled]);

  const leaving = useRef(false);
  return useCallback((then: () => void) => {
    if (leaving.current) return;
    const { width, height } = Dimensions.get('window');
    if (!on.current || height >= width) {
      then();
      return;
    }
    leaving.current = true;
    const turned = turnedUpright();
    lockPortrait()
      .then(() => turned)
      .then(() => {
        leaving.current = false;
        then();
      });
  }, []);
}
