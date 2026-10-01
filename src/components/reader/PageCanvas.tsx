import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { canvasToMaster, pageFit, type CanvasSize } from '../../services/study/canvasMath';
import type { BoxFit } from '../../utils/fitBox';
import type { LibraryPage } from '../../types/models';

const MAX_SCALE = 5;

export type MasterPoint = { x: number; y: number };

type PageCanvasProps = {
  page: LibraryPage;
  // Drawn over the image in the same (unzoomed) frame; `fit` maps master pixels into it
  // (canvasMath.masterToLayer).
  renderOverlay?: (fit: BoxFit) => ReactNode;
  // One-finger drags and taps, in master pixels. Two fingers pinch and pan.
  onDragStart?: (point: MasterPoint) => void;
  onDragMove?: (point: MasterPoint) => void;
  onDragEnd?: (point: MasterPoint) => void;
  onTap?: (point: MasterPoint) => void;
  background: string;
};

// §5 T3 (reused by T4): one library page as an image that can be zoomed and panned, with
// overlays and touches in master-pixel coordinates (where OCR boxes and annotations live). The
// native PDF view can't select or draw, so interactive work happens here.
export function PageCanvas({ page, renderOverlay, onDragStart, onDragMove, onDragEnd, onTap, background }: PageCanvasProps) {
  const [size, setSize] = useState<CanvasSize | null>(null);
  const fit = useMemo(() => (size ? pageFit(page, size) : null), [page, size]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Reads the current zoom on the JS thread, so a touch maps through what's on screen.
  const toMaster = useCallback(
    (x: number, y: number): MasterPoint | null =>
      fit && size ? canvasToMaster({ x, y }, fit, size, { scale: scale.value, tx: tx.value, ty: ty.value }) : null,
    [fit, size, scale, tx, ty]
  );
  const emit = useCallback(
    (kind: 'start' | 'move' | 'end' | 'tap', x: number, y: number) => {
      const point = toMaster(x, y);
      if (!point) return;
      if (kind === 'start') onDragStart?.(point);
      else if (kind === 'move') onDragMove?.(point);
      else if (kind === 'end') onDragEnd?.(point);
      else onTap?.(point);
    },
    [toMaster, onDragStart, onDragMove, onDragEnd, onTap]
  );

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, MAX_SCALE));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value === 1) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });
  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });
  const drag = Gesture.Pan()
    .maxPointers(1)
    .onStart((e) => runOnJS(emit)('start', e.x, e.y))
    .onUpdate((e) => runOnJS(emit)('move', e.x, e.y))
    .onEnd((e) => runOnJS(emit)('end', e.x, e.y));
  const tap = Gesture.Tap().onEnd((e) => runOnJS(emit)('tap', e.x, e.y));
  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, twoFingerPan), Gesture.Exclusive(drag, tap));

  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.container, { backgroundColor: background }]} onLayout={handleLayout}>
        {fit ? (
          <Animated.View style={[StyleSheet.absoluteFill, layerStyle]}>
            <Image
              source={{ uri: page.displayUri ?? page.fileUri }}
              style={{ position: 'absolute', left: fit.origin.x, top: fit.origin.y, width: fit.width, height: fit.height }}
              resizeMode="stretch"
            />
            {renderOverlay?.(fit)}
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});
