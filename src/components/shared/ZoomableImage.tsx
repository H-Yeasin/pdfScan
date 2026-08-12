import { StyleSheet, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MAX_SCALE = 5;
const SWIPE_DISTANCE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 300;

type ZoomableImageProps = {
  uri: string;
  style?: ViewStyle;
  // Pan-while-zoomed is disabled by default when an image sits inside a scrollable list
  // (e.g. Reader) to avoid the drag gesture fighting the list's own vertical scroll.
  panEnabled?: boolean;
  // Opt-in horizontal swipe-to-navigate, only recognized at scale 1 so it never fights the
  // pan-while-zoomed gesture above. Omitted entirely (e.g. by Reader's PageList) means no swipe
  // gesture is composed at all, leaving pinch/pan/double-tap behavior untouched there.
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

export function ZoomableImage({ uri, style, panEnabled = true, onSwipeLeft, onSwipeRight }: ZoomableImageProps) {
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

  const handleSwipeLeft = () => onSwipeLeft?.();
  const handleSwipeRight = () => onSwipeRight?.();

  const swipeNav = Gesture.Pan().onEnd((e) => {
    if (scale.value > 1) return;
    if (e.translationX <= -SWIPE_DISTANCE_THRESHOLD || e.velocityX <= -SWIPE_VELOCITY_THRESHOLD) {
      runOnJS(handleSwipeLeft)();
    } else if (e.translationX >= SWIPE_DISTANCE_THRESHOLD || e.velocityX >= SWIPE_VELOCITY_THRESHOLD) {
      runOnJS(handleSwipeRight)();
    }
  });

  const zoomGestures = Gesture.Exclusive(doubleTap, panEnabled ? Gesture.Simultaneous(pan, pinch) : pinch);
  const composed =
    onSwipeLeft || onSwipeRight ? Gesture.Simultaneous(swipeNav, zoomGestures) : zoomGestures;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.container, style]}>
        <Animated.Image source={{ uri }} style={[styles.image, animatedStyle]} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
