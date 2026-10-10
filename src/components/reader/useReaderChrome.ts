import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const KEEP_AWAKE_TAG = 'reader';

// §12 D2: the Reader's top and bottom bars. Tapping the page hides or shows them (immersive
// reading); going back a page (scrolling up) brings them back, the way a browser does.
// `visible` drives both bars' slide and fade. A new document starts with the bars shown and no
// page history (§18 W6: one instance per file).
export function useReaderChrome(keepAwake: boolean) {
  const visible = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState(true);
  const lastPage = useRef<number | null>(null);

  useEffect(() => {
    Animated.timing(visible, { toValue: shown ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [shown, visible]);

  const toggle = useCallback(() => setShown((v) => !v), []);
  // §18 W2: Find lives in the top bar, so opening it brings the bars back.
  const show = useCallback(() => setShown(true), []);

  const onPage = useCallback((page: number) => {
    if (lastPage.current !== null && page < lastPage.current) setShown(true);
    lastPage.current = page;
  }, []);

  // Reading settings: keep the screen on while the Reader is open. Best-effort: a phone that
  // refuses just sleeps as usual.
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [keepAwake]);

  return { visible, shown, toggle, show, onPage };
}
