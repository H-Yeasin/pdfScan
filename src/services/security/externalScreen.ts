// A screen of the phone's or an SDK's own on top of the app: the unlock sheet's PIN fallback
// (§10 M4) or a full-screen rewarded ad (§12 D1). Android reports the app as backgrounded while
// one is up, so AppState handlers (app lock, and any later refresh-on-return) ask this before
// treating that trip as the student leaving the app; otherwise "lock right away" would ask for
// the PIN the moment an ad closes.
//
// A count, not a flag, so two overlapping ones (an ad's own consent form, say) can't clear each
// other. The cost: while an ad is up, leaving it for the home screen doesn't start the lock
// timer either. The ad covers the app's content the whole time, and the timer starts again on
// the next real trip out.

let open = 0;

// Call the returned function once the screen is gone; calling it twice is harmless.
export function beginExternalScreen(): () => void {
  open += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    open = Math.max(0, open - 1);
  };
}

export function isExternalScreenOpen(): boolean {
  return open > 0;
}

// For tests.
export function resetExternalScreens(): void {
  open = 0;
}
