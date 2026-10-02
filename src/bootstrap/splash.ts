import * as SplashScreen from 'expo-splash-screen';

// §9 O1: the native splash stays up until the start screen is chosen and drawn, so a cold start
// never shows a blank frame or Capture flashing on the way to Home. `holdSplash` runs at module
// scope in App.tsx (the docs say a component effect can be too late); AppNavigator calls
// `releaseSplash` after the first frame of the real screen.
//
// The timeout lives here, not in a component, so even a crash during boot can't leave the user
// staring at the splash: after SPLASH_TIMEOUT_MS it hides regardless.
export const SPLASH_TIMEOUT_MS = 3000;

let released = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function holdSplash(timeoutMs = SPLASH_TIMEOUT_MS) {
  released = false;
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
