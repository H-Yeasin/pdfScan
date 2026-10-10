import { useCallback, useEffect, useRef, useState } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { CHROME_SHOWN, chromeAfterScroll, chromeAfterTap, type ChromeScroll } from '../../services/reader/chromeState';

const KEEP_AWAKE_TAG = 'reader';
const SLIDE_MS = 180;

// §12 D2: the Reader's top and bottom bars. Tapping the page hides or shows them (immersive
// reading); going back a page (scrolling up) brings them back, the way a browser does. A new
// document starts with the bars shown and no page history (§18 W6: one instance per file).
//
// §18 W10: `progress` (1 shown, 0 away) is a Reanimated shared value, so the bars slide on the UI
// thread and the page surface can follow them. On the surface the bars also hide by themselves
// as reading scrolls forward (`scrolled`, services/reader/chromeState). `locked`: something needs
// the bars (Find, a sheet, a tool), so they show and stay. The bars report their measured
// heights here (`bars`), which is what the surface keeps its first and last page clear of.
export function useReaderChrome(keepAwake: boolean, locked = false) {
  const progress = useSharedValue(1);
  const [shown, setShown] = useState(true);
  const lastPage = useRef<number | null>(null);
  // The UI thread's copy of the state, with how far the scroll has gone its present way.
  const scroll = useSharedValue<ChromeScroll>(CHROME_SHOWN);
  const lockedOn = useSharedValue(locked);

  useEffect(() => {
    progress.value = withTiming(shown ? 1 : 0, { duration: SLIDE_MS });
    scroll.value = { shown, travel: 0 };
  }, [shown, progress, scroll]);

  useEffect(() => {
    lockedOn.value = locked;
    if (locked) setShown(true);
  }, [locked, lockedOn]);

  const toggle = useCallback(() => setShown((v) => chromeAfterTap(v, locked)), [locked]);
  // §18 W2: Find lives in the top bar, so opening it brings the bars back.
  const show = useCallback(() => setShown(true), []);

  // pdf-jsi only says which page is on screen: going back a page shows the bars.
  const onPage = useCallback((page: number) => {
    if (lastPage.current !== null && page < lastPage.current) setShown(true);
    lastPage.current = page;
  }, []);

  // A worklet, called by the surface for every frame the finger (or its fling) scrolls.
  const scrolled = useCallback(
    (dy: number, atStart: boolean, atEnd: boolean) => {
      'worklet';
      const before = scroll.value;
      const next = chromeAfterScroll(before, dy, { atStart, atEnd }, lockedOn.value);
      if (next === before) return;
      scroll.value = next;
      if (next.shown !== before.shown) runOnJS(setShown)(next.shown);
    },
    [scroll, lockedOn]
  );

  const [bars, setBars] = useState({ top: 0, bottom: 0 });
  const onTopHeight = useCallback((top: number) => setBars((b) => (b.top === top ? b : { ...b, top })), []);
  const onBottomHeight = useCallback((bottom: number) => setBars((b) => (b.bottom === bottom ? b : { ...b, bottom })), []);

  // Reading settings: keep the screen on while the Reader is open. Best-effort: a phone that
  // refuses just sleeps as usual.
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [keepAwake]);

  return { progress, shown, toggle, show, onPage, scrolled, bars, onTopHeight, onBottomHeight };
}
