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
