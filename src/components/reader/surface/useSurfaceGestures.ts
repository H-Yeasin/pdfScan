import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, runOnJS, useSharedValue, withDecay, withTiming, type SharedValue } from 'react-native-reanimated';
import { strokeOutcome, type PanMode } from '../../../services/reader/gestureArbiter';
import { handleAt, type HandlePoints, type SelectionHandle } from '../../../services/reader/selection';
import {
  clampView,
  clampZoom,
  currentPage,
  doubleTapView,
  pageAtY,
  pageBox,
  pagedSnap,
  screenToContent,
  scrollRange,
  viewForPage,
  zoomAbout,
  type ContentInsets,
  type ContentRect,
  type Size,
  type SurfaceLayout,
  type SurfaceView,
} from '../../../services/reader/surfaceGeometry';
import { moveSignatureBox, resizeSignatureBox, SIGN_BOX_SLOP, SIGN_HANDLE_HIT, signatureGrip } from '../../../services/signature/signaturePlacement';
import type { SurfaceMotion } from './useSurfaceView';

// A double tap's zoom and a page turn's snap.
const GLIDE_MS = 220;
// A finger held still this long selects the word under it (A5).
const LONG_PRESS_MS = 400;
// How far a finger moves before it is a drag: sooner while drawing, so the ink starts under it.
const DRAW_SLOP = 3;
const DRAG_SLOP = 10;

// A selection handle under the finger: grabbed (the pan's first movement), moved, let go. Each
// comes with the view at that moment, which React may not have heard of yet.
export type HandleDrag = 'grab' | 'move' | 'drop';
// §18 W15: a mark under the finger (a text box, a signature). 'cancel': a second finger or a
// pinch took the gesture over, and the mark goes back where it was.
export type MarkDrag = HandleDrag | 'cancel';

// What one finger is doing, for as long as it is down.
type Role = 'none' | 'scroll' | 'stroke' | 'drag' | 'signMove' | 'signResize';

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
  // §18 W15 (A5): what a one-finger drag is (gestureArbiter.panMode), and whether taps wait for
  // a second one and a held finger selects (reading and selecting only).
  mode: PanMode;
  readingTaps: boolean;
  // The provisional stroke: x, y pairs in content coordinates, drawn by the overlay from the UI
  // thread and emptied when the stroke is decided. `inkId` counts strokes, so a late "clear"
  // for one never wipes the next.
  ink: SharedValue<number[]>;
  inkId: SharedValue<number>;
  // The stroke's width on screen content: the tool's width in the page's own units (`inkTool`)
  // times that page's scale (`inkScales`, one per page: content units per unit of its space).
  inkWidth: SharedValue<number>;
  inkTool: number;
  inkScales: readonly number[];
  // A stroke that became a mark: its points (content coordinates) and its number.
  onStroke: (points: number[], id: number) => void;
  // A drag that began with a tool that moves marks. JS says whether one is under it.
  onMarkDrag: (phase: MarkDrag, x: number, y: number, scale: number, tx: number, ty: number) => void;
  // §18 W16 (A10): the signature being placed (content coordinates; null: none), and the page
  // it stays on.
  signBox: SharedValue<ContentRect | null>;
  signPage: number;
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
// §18 W15 (A5), the Mark tools. Two fingers still scroll and zoom; one finger does what `mode`
// says:
//  - 'draw': a provisional stroke. Its points go into a shared value the overlay draws from, so
//    no React render happens per move. Whether it becomes a mark is decided when the gesture is
//    finalised (gestureArbiter.strokeOutcome): not if a second finger or a pinch joined (the
//    pinch race), and a stroke too short to be a line is the tap it was;
//  - 'drag': moves the mark it began on (JS hit-tests it);
//  - taps act at once: no double tap, no long press.
// §18 W16 (A10): 'sign' moves or resizes the signature being placed when the drag begins on it
// (hit-tested here against its shared box), and scrolls otherwise.
export function useSurfaceGestures({
  layout,
  viewport,
  insets,
  motion,
  onTap,
  onLongPress,
  handles,
  onHandle,
  mode,
  readingTaps,
  ink,
  inkId,
  inkWidth,
  inkTool,
  inkScales,
  onStroke,
  onMarkDrag,
  signBox,
  signPage,
}: Options) {
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
  // §18 W15: what this drag is, where the finger came down, and what the pinch race needs.
  const role = useSharedValue<Role>('none');
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);
  const multi = useSharedValue(false);
  const strokeAt = useSharedValue(0);
  const pinchAt = useSharedValue<number | null>(null);
  const travel = useSharedValue(0);

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
    // The drag scrolls from here on (its start, or a stroke a second finger took over).
    const beginScroll = () => {
      'worklet';
      stop();
      role.value = 'scroll';
      moving.value = true;
      panning.value = true;
      fromPage.value = currentPage(layout, now(), viewport.height, insets);
    };
    const dropInk = () => {
      'worklet';
      ink.value = [];
    };
    // A second finger or a pinch joined what one finger was doing: that is over, undone, and the
    // fingers scroll.
    const takeOver = () => {
      'worklet';
      multi.value = true;
      if (role.value === 'stroke') dropInk();
      else if (role.value === 'drag') runOnJS(onMarkDrag)('cancel', 0, 0, scale.value, tx.value, ty.value);
      else if (role.value !== 'signMove' && role.value !== 'signResize') return;
      beginScroll();
    };

    const pinch = Gesture.Pinch()
      .onStart(() => {
        stop();
        pinchAt.value = Date.now();
        takeOver();
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
      .minDistance(mode === 'draw' ? DRAW_SLOP : DRAG_SLOP)
      .onBegin((e) => {
        grabbed.value = readingTaps && e.numberOfPointers === 1 ? handleAt(handles.value, now(), e.x, e.y) : null;
        dragging.value = false;
        role.value = 'none';
        downX.value = e.x;
        downY.value = e.y;
        multi.value = e.numberOfPointers > 1;
        pinchAt.value = null;
        caught.value = moving.value && !panning.value && !pinching.value;
        if (caught.value) stop();
      })
      .onTouchesDown((e) => {
        if (e.numberOfTouches > 1) takeOver();
      })
      .onStart((e) => {
        if (grabbed.value) {
          dragging.value = true;
          runOnJS(onHandle)('grab', grabbed.value, e.x, e.y, scale.value, tx.value, ty.value);
          return;
        }
        const one = e.numberOfPointers === 1 && !multi.value && !pinching.value;
        const view = now();
        const at = screenToContent(view, downX.value, downY.value);
        if (one && mode === 'draw') {
          stop();
          role.value = 'stroke';
          strokeAt.value = Date.now();
          travel.value = Math.hypot(e.x - downX.value, e.y - downY.value);
          inkId.value += 1;
          inkWidth.value = inkTool * (inkScales[pageAtY(layout, at.y)] ?? 1);
          const to = screenToContent(view, e.x, e.y);
          ink.value = [at.x, at.y, to.x, to.y];
          return;
        }
        if (one && mode === 'drag') {
          stop();
          role.value = 'drag';
          runOnJS(onMarkDrag)('grab', downX.value, downY.value, view.scale, view.tx, view.ty);
          runOnJS(onMarkDrag)('move', e.x, e.y, view.scale, view.tx, view.ty);
          return;
        }
        if (one && mode === 'sign') {
          const grip = signatureGrip(signBox.value, at.x, at.y, SIGN_HANDLE_HIT / view.scale, SIGN_BOX_SLOP / view.scale);
          if (grip) {
            stop();
            role.value = grip === 'resize' ? 'signResize' : 'signMove';
            return;
          }
        }
        beginScroll();
      })
      .onChange((e) => {
        if (grabbed.value) {
          if (dragging.value) runOnJS(onHandle)('move', grabbed.value, e.x, e.y, scale.value, tx.value, ty.value);
          return;
        }
        if (role.value !== 'scroll' && role.value !== 'none' && e.numberOfPointers > 1) takeOver();
        switch (role.value) {
          case 'stroke': {
            const to = screenToContent(now(), e.x, e.y);
            travel.value += Math.hypot(e.changeX, e.changeY);
            ink.modify((points) => {
              'worklet';
              points.push(to.x, to.y);
              return points;
            });
            return;
          }
          case 'drag':
            runOnJS(onMarkDrag)('move', e.x, e.y, scale.value, tx.value, ty.value);
            return;
          case 'signMove':
          case 'signResize': {
            const box = signBox.value;
            if (!box || signPage < 0 || signPage >= layout.tops.length) return;
            const page = pageBox(layout, signPage);
            const dx = e.changeX / scale.value;
            const dy = e.changeY / scale.value;
            signBox.value = role.value === 'signMove' ? moveSignatureBox(page, box, dx, dy) : resizeSignatureBox(page, box, dx, dy);
            return;
          }
          case 'scroll':
            put(clampView(layout, { scale: scale.value, tx: tx.value + e.changeX, ty: ty.value + e.changeY }, viewport, insets));
            return;
          default:
            return;
        }
      })
      .onFinalize((e, success) => {
        if (grabbed.value) {
          if (dragging.value) runOnJS(onHandle)('drop', grabbed.value, e.x, e.y, scale.value, tx.value, ty.value);
          grabbed.value = null;
          dragging.value = false;
          return;
        }
        const was = role.value;
        role.value = 'none';
        if (was === 'stroke') {
          // A5's pinch race: decided here, when the whole gesture is known.
          const outcome = strokeOutcome({ success, multiTouch: multi.value, startedAt: strokeAt.value, pinchAt: pinchAt.value, travel: travel.value });
          if (outcome === 'commit') {
            // The ink stays until the mark it becomes is drawn (JS clears it by its number).
            runOnJS(onStroke)(ink.value.slice(), inkId.value);
            return;
          }
          dropInk();
          if (outcome === 'tap') runOnJS(onTap)(downX.value, downY.value);
          return;
        }
        if (was === 'drag') {
          runOnJS(onMarkDrag)(success ? 'drop' : 'cancel', e.x, e.y, scale.value, tx.value, ty.value);
          return;
        }
        if (was === 'signMove' || was === 'signResize') return;
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

    const singleTap = Gesture.Tap().onEnd((e, success) => {
      // A touch on a handle that never became a drag is not a tap on the page under it.
      if (success && !caught.value && !(readingTaps && handleAt(handles.value, now(), e.x, e.y))) runOnJS(onTap)(e.x, e.y);
    });
    // A Mark tool acts on a tap at once, and nothing is selected or zoomed past the signature
    // being placed: no waiting for a second tap, no long press.
    if (!readingTaps) return Gesture.Race(Gesture.Simultaneous(pinch, pan), singleTap);

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
    // On a handle the press is the start of a drag, not a new selection.
    const longPress = Gesture.LongPress()
      .minDuration(LONG_PRESS_MS)
      .onStart((e) => {
        if (handleAt(handles.value, now(), e.x, e.y)) return;
        runOnJS(onLongPress)(e.x, e.y, scale.value, tx.value, ty.value);
      });

    return Gesture.Race(Gesture.Simultaneous(pinch, pan), longPress, Gesture.Exclusive(doubleTap, singleTap));
  }, [
    layout,
    viewport,
    insets,
    scale,
    tx,
    ty,
    moving,
    settled,
    pinchStart,
    panning,
    pinching,
    fromPage,
    caught,
    grabbed,
    dragging,
    role,
    downX,
    downY,
    multi,
    strokeAt,
    pinchAt,
    travel,
    onTap,
    onLongPress,
    handles,
    onHandle,
    mode,
    readingTaps,
    ink,
    inkId,
    inkWidth,
    inkTool,
    inkScales,
    onStroke,
    onMarkDrag,
    signBox,
    signPage,
  ]);
}
