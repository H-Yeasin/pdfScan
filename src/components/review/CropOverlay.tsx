import { useMemo } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { radii, spacing, useTheme } from '../../theme';

const HANDLE_SIZE = 28;
const HANDLE_HIT_SLOP = 16;
const MIN_CROP = 40;

type CropOverlayProps = {
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  onConfirm: (cropRect: { originX: number; originY: number; width: number; height: number }) => void;
  onCancel: () => void;
};

export function CropOverlay({ uri, naturalWidth, naturalHeight, onConfirm, onCancel }: CropOverlayProps) {
  const { tokens } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const { displayWidth, displayHeight } = useMemo(() => {
    const maxWidth = screenWidth - spacing.xl * 2;
    const maxHeight = screenHeight * 0.62;
    const ratio = naturalHeight / naturalWidth;
    let w = maxWidth;
    let h = w * ratio;
    if (h > maxHeight) {
      h = maxHeight;
      w = h / ratio;
    }
    return { displayWidth: w, displayHeight: h };
  }, [screenWidth, screenHeight, naturalWidth, naturalHeight]);

  const left = useSharedValue(0);
  const top = useSharedValue(0);
  const right = useSharedValue(displayWidth);
  const bottom = useSharedValue(displayHeight);

  // Snapshot of the rect at gesture-start, read by every pan below. `event.translationX/Y` is an
  // accumulated delta from the *finger's* initial touch point, not the (moving) handle view's own
  // position, so anchoring every update to this fixed snapshot — rather than the previous approach
  // of reading `event.x/y`, which is relative to the handle view and drifts every time that view
  // is repositioned mid-drag — keeps the drag 1:1 with the finger instead of jittering/running away.
  const startLeft = useSharedValue(0);
  const startTop = useSharedValue(0);
  const startRight = useSharedValue(0);
  const startBottom = useSharedValue(0);

  const captureStart = () => {
    'worklet';
    startLeft.value = left.value;
    startTop.value = top.value;
    startRight.value = right.value;
    startBottom.value = bottom.value;
  };

  const topLeftPan = Gesture.Pan()
    .hitSlop(HANDLE_HIT_SLOP)
    .onStart(captureStart)
    .onUpdate((e) => {
      left.value = clamp(startLeft.value + e.translationX, 0, right.value - MIN_CROP);
      top.value = clamp(startTop.value + e.translationY, 0, bottom.value - MIN_CROP);
    });

  const topRightPan = Gesture.Pan()
    .hitSlop(HANDLE_HIT_SLOP)
    .onStart(captureStart)
    .onUpdate((e) => {
      right.value = clamp(startRight.value + e.translationX, left.value + MIN_CROP, displayWidth);
      top.value = clamp(startTop.value + e.translationY, 0, bottom.value - MIN_CROP);
    });

  const bottomLeftPan = Gesture.Pan()
    .hitSlop(HANDLE_HIT_SLOP)
    .onStart(captureStart)
    .onUpdate((e) => {
      left.value = clamp(startLeft.value + e.translationX, 0, right.value - MIN_CROP);
      bottom.value = clamp(startBottom.value + e.translationY, top.value + MIN_CROP, displayHeight);
    });

  const bottomRightPan = Gesture.Pan()
    .hitSlop(HANDLE_HIT_SLOP)
    .onStart(captureStart)
    .onUpdate((e) => {
      right.value = clamp(startRight.value + e.translationX, left.value + MIN_CROP, displayWidth);
      bottom.value = clamp(startBottom.value + e.translationY, top.value + MIN_CROP, displayHeight);
    });

  const movePan = Gesture.Pan()
    .onStart(captureStart)
    .onUpdate((e) => {
      const w = startRight.value - startLeft.value;
      const h = startBottom.value - startTop.value;
      const newLeft = clamp(startLeft.value + e.translationX, 0, displayWidth - w);
      const newTop = clamp(startTop.value + e.translationY, 0, displayHeight - h);
      left.value = newLeft;
      top.value = newTop;
      right.value = newLeft + w;
      bottom.value = newTop + h;
    });

  const rectStyle = useAnimatedStyle(() => ({
    left: left.value,
    top: top.value,
    width: right.value - left.value,
    height: bottom.value - top.value,
  }));
  const topCurtain = useAnimatedStyle(() => ({ height: top.value }));
  const bottomCurtain = useAnimatedStyle(() => ({ height: displayHeight - bottom.value }));
  const leftCurtain = useAnimatedStyle(() => ({ top: top.value, height: bottom.value - top.value, width: left.value }));
  const rightCurtain = useAnimatedStyle(() => ({
    top: top.value,
    height: bottom.value - top.value,
    width: displayWidth - right.value,
  }));
  const topLeftHandleStyle = useAnimatedStyle(() => ({
    left: left.value - HANDLE_SIZE / 2,
    top: top.value - HANDLE_SIZE / 2,
  }));
  const topRightHandleStyle = useAnimatedStyle(() => ({
    left: right.value - HANDLE_SIZE / 2,
    top: top.value - HANDLE_SIZE / 2,
  }));
  const bottomLeftHandleStyle = useAnimatedStyle(() => ({
    left: left.value - HANDLE_SIZE / 2,
    top: bottom.value - HANDLE_SIZE / 2,
  }));
  const bottomRightHandleStyle = useAnimatedStyle(() => ({
    left: right.value - HANDLE_SIZE / 2,
    top: bottom.value - HANDLE_SIZE / 2,
  }));

  const handleReset = () => {
    left.value = 0;
    top.value = 0;
    right.value = displayWidth;
    bottom.value = displayHeight;
  };

  const handleConfirm = () => {
    const scale = naturalWidth / displayWidth;
    onConfirm({
      originX: Math.round(left.value * scale),
      originY: Math.round(top.value * scale),
      width: Math.round((right.value - left.value) * scale),
      height: Math.round((bottom.value - top.value) * scale),
    });
  };

  return (
    <Modal transparent animationType="fade">
      <GestureHandlerRootView style={styles.backdrop}>
        <View style={{ width: displayWidth, height: displayHeight }}>
          <Image source={{ uri }} style={{ width: displayWidth, height: displayHeight }} resizeMode="contain" />
          <Animated.View pointerEvents="none" style={[styles.curtain, styles.curtainTop, topCurtain]} />
          <Animated.View pointerEvents="none" style={[styles.curtain, styles.curtainBottom, bottomCurtain]} />
          <Animated.View pointerEvents="none" style={[styles.curtain, leftCurtain]} />
          <Animated.View pointerEvents="none" style={[styles.curtain, rightCurtain, { right: 0, left: undefined }]} />

          <GestureDetector gesture={movePan}>
            <Animated.View style={[styles.moveArea, rectStyle]} />
          </GestureDetector>
          <Animated.View pointerEvents="none" style={[styles.rectBorder, { borderColor: tokens.accent }, rectStyle]} />

          <GestureDetector gesture={topLeftPan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, topLeftHandleStyle]} />
          </GestureDetector>
          <GestureDetector gesture={topRightPan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, topRightHandleStyle]} />
          </GestureDetector>
          <GestureDetector gesture={bottomLeftPan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, bottomLeftHandleStyle]} />
          </GestureDetector>
          <GestureDetector gesture={bottomRightPan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, bottomRightHandleStyle]} />
          </GestureDetector>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.ghostButton} onPress={onCancel}>
            <Text style={styles.ghostLabel}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={handleReset}>
            <Text style={styles.ghostLabel}>Reset</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, { backgroundColor: tokens.accent }]} onPress={handleConfirm}>
            <Text style={styles.primaryLabel}>Crop</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  curtain: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,.6)',
  },
  curtainTop: { top: 0 },
  curtainBottom: { bottom: 0 },
  moveArea: {
    position: 'absolute',
  },
  rectBorder: {
    position: 'absolute',
    borderWidth: 2,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 4,
    backgroundColor: '#fff',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  ghostButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  ghostLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
