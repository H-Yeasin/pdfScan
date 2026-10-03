import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const KEEP_AWAKE_TAG = 'reader';

// §12 D2: the Reader's top and bottom bars. Tapping the page hides or shows them (immersive
// reading); going back a page (scrolling up) brings them back, the way a browser does.
// `visible` drives both bars' slide and fade.
export function useReaderChrome(keepAwake: boolean) {
  const visible = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState(true);
  const lastPage = useRef<number | null>(null);

  useEffect(() => {
    Animated.timing(visible, { toValue: shown ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [shown, visible]);

  const toggle = useCallback(() => setShown((v) => !v), []);

  const onPage = useCallback((page: number) => {
    if (lastPage.current !== null && page < lastPage.current) setShown(true);
    lastPage.current = page;
  }, []);

  // A new document starts with the bars shown and no page history.
  const reset = useCallback(() => {
    lastPage.current = null;
    setShown(true);
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

  return { visible, shown, toggle, onPage, reset };
}
