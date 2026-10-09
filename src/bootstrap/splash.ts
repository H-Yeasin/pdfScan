import * as SplashScreen from 'expo-splash-screen';

// §9 O1: the native splash stays up until something is drawn behind it, so a cold start never shows
// a blank frame or Capture flashing on the way to Home. `holdSplash` runs at module scope in App.tsx
// (the docs say a component effect can be too late). §15 V5: the splash intro's overlay
// (components/brand/SplashIntro.tsx) calls `releaseSplash` once its first frame, identical to the
// native splash, is laid out; the app boots underneath it.
//
// The timeout lives here, not in a component, so even a crash during boot can't leave the user
// staring at the splash: after SPLASH_TIMEOUT_MS it hides regardless.
export const SPLASH_TIMEOUT_MS = 3000;

// §15 V5: the native splash's fade-out; the overlay holds still at least this long (splashIntro.ts).
export const SPLASH_EXIT_MS = 150;

let released = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function holdSplash(timeoutMs = SPLASH_TIMEOUT_MS) {
  released = false;
  // §15 V5: the fade-out the native splash plays over the overlay's identical frame. Set here, long
  // before hide(): Android applies options later, on the main queue, so setting them right before
  // hide() can lose the race. `fade` is for iOS; Android always fades and reads only `duration`.
  try {
    SplashScreen.setOptions({ duration: SPLASH_EXIT_MS, fade: true });
  } catch {
    // Best-effort, like hide(): an old dev build without it keeps the default 400 ms.
  }
  // Rejects when the splash is already gone (e.g. a fast refresh in development): nothing to hold.
  SplashScreen.preventAutoHideAsync().catch(() => {});
  timer = setTimeout(releaseSplash, timeoutMs);
}

export function releaseSplash() {
  if (released) return;
  released = true;
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    SplashScreen.hide();
  } catch {
    // Best-effort: a missing native module (an old dev build) must not break the app.
  }
}
