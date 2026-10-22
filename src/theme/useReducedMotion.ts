import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// §9 O4b: the system's "Remove animations" (Android) / "Reduce Motion" (iOS) setting, live. When on,
// screen slides become fades and looping animations stop.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (mounted) setReduced(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

// §17 U13: the same setting, read synchronously by code that isn't a component (a LayoutAnimation
// configured just before a dispatch). The first call starts listening; until the system answers it
// says false, like the hook's first render.
let reducedNow = false;
let listening = false;

export function reducedMotionNow(): boolean {
  if (!listening) {
    listening = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        reducedNow = on;
      })
      .catch(() => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reducedNow = on;
    });
  }
  return reducedNow;
}
