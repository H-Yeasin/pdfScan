import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MAX_SCALE = 5;

type UseZoomableImageGestureOptions = {
  // Pan-while-zoomed is disabled by default when an image sits inside a scrollable list
  // (e.g. Reader) to avoid the drag gesture fighting the list's own vertical scroll.
  panEnabled?: boolean;
};

// Pinch-to-zoom, pan-while-zoomed, and double-tap-to-zoom for a single image, shared between
// ZoomableImage (Reader, Review) and PagePeekCarousel (Review's current-page panel, which also
// exposes the returned `scale` to its own paging pan gesture so the two never fight over a drag).
export function useZoomableImageGesture({ panEnabled = true }: UseZoomableImageGestureOptions = {}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTranslation = () => {
    'worklet';
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, MAX_SCALE));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value === 1) resetTranslation();
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > 1 ? 1 : 2;
      scale.value = withTiming(next);
      savedScale.value = next;
      if (next === 1) resetTranslation();
    });

  const gesture = Gesture.Exclusive(doubleTap, panEnabled ? Gesture.Simultaneous(pan, pinch) : pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return { gesture, animatedStyle, scale, translateX, translateY };
}
