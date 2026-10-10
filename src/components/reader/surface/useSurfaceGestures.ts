import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, runOnJS, useSharedValue, withDecay, withTiming, type SharedValue } from 'react-native-reanimated';
import { handleAt, type HandlePoints, type SelectionHandle } from '../../../services/reader/selection';
import {
  clampView,
  clampZoom,
  currentPage,
  doubleTapView,
  pagedSnap,
  scrollRange,
  viewForPage,
  zoomAbout,
  type ContentInsets,
  type Size,
  type SurfaceLayout,
  type SurfaceView,
} from '../../../services/reader/surfaceGeometry';
import type { SurfaceMotion } from './useSurfaceView';

// A double tap's zoom and a page turn's snap.
const GLIDE_MS = 220;
// A finger held still this long selects the word under it (A5).
const LONG_PRESS_MS = 400;

// A selection handle under the finger: grabbed (the pan's first movement), moved, let go. Each
// comes with the view at that moment, which React may not have heard of yet.
export type HandleDrag = 'grab' | 'move' | 'drop';

type Options = {
  layout: SurfaceLayout | null;
  viewport: Size | null;
  insets: ContentInsets;
  motion: SurfaceMotion;
  // A single tap, where it landed in the viewport (§18 W11: a link may be under it).
  onTap: (x: number, y: number) => void;
  // §18 W13: a long press at a point of the viewport, with the view as it is then.
  onLongPress: (x: number, y: number, scale: number, tx: number, ty: number) => void;
  // The open selection's handle tips in content coordinates (null: no selection), and a drag
  // that began on one of them.
  handles: SharedValue<HandlePoints | null>;
  onHandle: (phase: HandleDrag, handle: SelectionHandle, x: number, y: number, scale: number, tx: number, ty: number) => void;
};

// §18 W10 (A5, the read tool): the surface's gestures, all on the UI thread.
//  - one or two fingers scroll, and a fling carries on (page by page: it settles on a page);
//  - a pinch zooms about its middle, while the same fingers still scroll;
//  - a double tap zooms in about the finger, or back out; a single tap is the surface's to route
//    (a link under it, else the Reader's bars).
// §18 W13 (A8):
//  - a long press selects the word under the finger;
//  - a drag that starts on a selection handle moves that handle and scrolls nothing. Which word
//    it lands on is worked out in JS (useSurfaceSelection); only the hit-test is here.
// W15 adds the Mark tools.
export function useSurfaceGestures({ layout, viewport, insets, motion, onTap, onLongPress, handles, onHandle }: Options) {
  const { scale, tx, ty, moving, settled } = motion;
  const pinchStart = useSharedValue(1);
  const panning = useSharedValue(false);
  const pinching = useSharedValue(false);
  // The page a drag began on: one swipe turns one page (surfaceGeometry.pagedSnap).
  const fromPage = useSharedValue(0);
  // A finger came down on a fling and stopped it. If it lifts without dragging, that was the
  // whole gesture: the view rests there, and the tap is not a tap on the page.
  const caught = useSharedValue(false);
  // The handle the finger came down on, for as long as it is down.
  const grabbed = useSharedValue<SelectionHandle | null>(null);
  const dragging = useSharedValue(false);

  return useMemo(() => {
    if (!layout || !viewport) return Gesture.Tap().enabled(false);

    const now = (): SurfaceView => {
      'worklet';
      return { scale: scale.value, tx: tx.value, ty: ty.value };
    };
    const put = (view: SurfaceView) => {
      'worklet';
      scale.value = view.scale;
      tx.value = view.tx;
      ty.value = view.ty;
    };
    const stop = () => {
      'worklet';
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
    };
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) settled();
    };
    // Lets go of the view: it runs on by its speed, inside the document, and reports when it rests.
    const fling = (vx: number, vy: number) => {
      'worklet';
      const view = now();
      const range = scrollRange(layout, view.scale, viewport, insets);
      tx.value = withDecay({ velocity: vx, clamp: [range.minTx, range.maxTx] });
      const slots = layout.slots;
      if (!slots) {
        ty.value = withDecay({ velocity: vy, clamp: [range.minTy, range.maxTy] }, done);
        return;
      }
      const snap = pagedSnap(layout, view, viewport, vy, fromPage.value, insets);
      if (snap) {
        ty.value = withTiming(Math.min(range.maxTy, Math.max(range.minTy, snap.ty)), { duration: GLIDE_MS }, done);
        return;
      }
      // A tall or zoomed page: free inside its own stretch.
      const page = Math.max(0, Math.min(fromPage.value, slots.length - 2));
      const low = Math.max(range.minTy, viewport.height - insets.bottom - slots[page + 1] * view.scale);
      const high = Math.min(range.maxTy, insets.top - slots[page] * view.scale);
      ty.value = withDecay({ velocity: vy, clamp: [Math.min(low, high), high] }, done);
    };
    const glide = (to: SurfaceView) => {
      'worklet';
      moving.value = true;
      tx.value = withTiming(to.tx, { duration: GLIDE_MS });
      ty.value = withTiming(to.ty, { duration: GLIDE_MS });
      scale.value = withTiming(to.scale, { duration: GLIDE_MS }, done);
    };

    const pinch = Gesture.Pinch()
      .onStart(() => {
        stop();
        moving.value = true;
        pinching.value = true;
        pinchStart.value = scale.value;
      })
      .onUpdate((e) => {
        const next = clampZoom(pinchStart.value * e.scale);
        put(clampView(layout, zoomAbout(now(), next, e.focalX, e.focalY), viewport, insets));
      })
      .onFinalize(() => {
        if (!pinching.value) return;
        pinching.value = false;
        if (panning.value) return;
        // Page by page, the pinch may have left the view between two pages.
        fromPage.value = currentPage(layout, now(), viewport.height, insets);
        fling(0, 0);
      });

    const pan = Gesture.Pan()
      .averageTouches(true)
      .onBegin((e) => {
        grabbed.value = e.numberOfPointers === 1 ? handleAt(handles.value, now(), e.x, e.y) : null;
        dragging.value = false;
        caught.value = moving.value && !panning.value && !pinching.value;
        if (caught.value) stop();
      })
      .onStart((e) => {
        if (grabbed.value) {
          dragging.value = true;
          runOnJS(onHandle)('grab', grabbed.value, e.x, e.y, scale.value, tx.value, ty.value);
          return;
        }
        stop();
        moving.value = true;
        panning.value = true;
        fromPage.value = currentPage(layout, now(), viewport.height, insets);
      })
      .onChange((e) => {
        if (grabbed.value) {
          if (dragging.value) runOnJS(onHandle)('move', grabbed.value, e.x, e.y, scale.value, tx.value, ty.value);
          return;
        }
        put(clampView(layout, { scale: scale.value, tx: tx.value + e.changeX, ty: ty.value + e.changeY }, viewport, insets));
      })
      .onFinalize((e) => {
        if (grabbed.value) {
          if (dragging.value) runOnJS(onHandle)('drop', grabbed.value, e.x, e.y, scale.value, tx.value, ty.value);
          grabbed.value = null;
          dragging.value = false;
          return;
        }
        if (!panning.value) {
          if (caught.value && !pinching.value) {
            fromPage.value = currentPage(layout, now(), viewport.height, insets);
            fling(0, 0);
          }
          return;
        }
        panning.value = false;
        if (!pinching.value) fling(e.velocityX, e.velocityY);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e, success) => {
        if (!success) return;
        stop();
        const view = now();
        let to = doubleTapView(layout, view, e.x, e.y, viewport, insets);
        // Zoomed back out page by page: onto the page, not between two.
        if (layout.slots && to.scale === 1) to = viewForPage(layout, currentPage(layout, view, viewport.height, insets), to, viewport, insets);
        glide(to);
      });
    const singleTap = Gesture.Tap().onEnd((e, success) => {
      // A touch on a handle that never became a drag is not a tap on the page under it.
      if (success && !caught.value && !handleAt(handles.value, now(), e.x, e.y)) runOnJS(onTap)(e.x, e.y);
    });
    // On a handle the press is the start of a drag, not a new selection.
    const longPress = Gesture.LongPress()
      .minDuration(LONG_PRESS_MS)
      .onStart((e) => {
        if (handleAt(handles.value, now(), e.x, e.y)) return;
        runOnJS(onLongPress)(e.x, e.y, scale.value, tx.value, ty.value);
      });

    return Gesture.Race(Gesture.Simultaneous(pinch, pan), longPress, Gesture.Exclusive(doubleTap, singleTap));
  }, [layout, viewport, insets, scale, tx, ty, moving, settled, pinchStart, panning, pinching, fromPage, caught, grabbed, dragging, onTap, onLongPress, handles, onHandle]);
}
