import { useMemo } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Polygon } from 'react-native-svg';
import { radii, spacing, useTheme } from '../../theme';
import type { Point } from '../../services/enhance/perspective';

const HANDLE_SIZE = 28;
const HANDLE_HIT_SLOP = 16;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

type CropOverlayProps = {
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  // Optional step indicator (e.g. "Page 1 of 2") for a multi-crop flow like the merge-two-pages
  // feature. Omitted by the single-crop call site, so its layout is unaffected.
  stepLabel?: string;
  // Natural-pixel-space corners, topLeft/topRight/bottomRight/bottomLeft order — the caller runs
  // the actual perspective warp (mirrors how rotatePage/cropPage are invoked from ReviewScreen).
  onConfirm: (points: [Point, Point, Point, Point]) => void;
  onCancel: () => void;
};

type Corner = { x: SharedValue<number>; y: SharedValue<number>; startX: SharedValue<number>; startY: SharedValue<number> };

function useCornerPoint(initX: number, initY: number): Corner {
  return {
    x: useSharedValue(initX),
    y: useSharedValue(initY),
    startX: useSharedValue(0),
    startY: useSharedValue(0),
  };
}

// Four independently draggable corners (not constrained to a rectangle) so the user can trace
// a document's actual edges even when the photo was taken at an angle; onConfirm hands the raw
// quad back to the caller, which runs a perspective warp to straighten it into a rectangle.
export function CropOverlay({ uri, naturalWidth, naturalHeight, stepLabel, onConfirm, onCancel }: CropOverlayProps) {
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

  const topLeft = useCornerPoint(0, 0);
  const topRight = useCornerPoint(displayWidth, 0);
  const bottomRight = useCornerPoint(displayWidth, displayHeight);
  const bottomLeft = useCornerPoint(0, displayHeight);

  const makeCornerPan = (corner: Corner) =>
    Gesture.Pan()
      .hitSlop(HANDLE_HIT_SLOP)
      .onStart(() => {
        corner.startX.value = corner.x.value;
        corner.startY.value = corner.y.value;
      })
      .onUpdate((e) => {
        corner.x.value = clamp(corner.startX.value + e.translationX, 0, displayWidth);
        corner.y.value = clamp(corner.startY.value + e.translationY, 0, displayHeight);
      });

  const topLeftPan = makeCornerPan(topLeft);
  const topRightPan = makeCornerPan(topRight);
  const bottomRightPan = makeCornerPan(bottomRight);
  const bottomLeftPan = makeCornerPan(bottomLeft);

  const topLeftHandleStyle = useAnimatedStyle(() => ({
    left: topLeft.x.value - HANDLE_SIZE / 2,
    top: topLeft.y.value - HANDLE_SIZE / 2,
  }));
  const topRightHandleStyle = useAnimatedStyle(() => ({
    left: topRight.x.value - HANDLE_SIZE / 2,
    top: topRight.y.value - HANDLE_SIZE / 2,
  }));
  const bottomRightHandleStyle = useAnimatedStyle(() => ({
    left: bottomRight.x.value - HANDLE_SIZE / 2,
    top: bottomRight.y.value - HANDLE_SIZE / 2,
  }));
  const bottomLeftHandleStyle = useAnimatedStyle(() => ({
    left: bottomLeft.x.value - HANDLE_SIZE / 2,
    top: bottomLeft.y.value - HANDLE_SIZE / 2,
  }));

  const maskProps = useAnimatedProps(() => ({
    d:
      `M0,0 H${displayWidth} V${displayHeight} H0 Z ` +
      `M${topLeft.x.value},${topLeft.y.value} L${topRight.x.value},${topRight.y.value} ` +
      `L${bottomRight.x.value},${bottomRight.y.value} L${bottomLeft.x.value},${bottomLeft.y.value} Z`,
  }));
  const polygonProps = useAnimatedProps(() => ({
    points:
      `${topLeft.x.value},${topLeft.y.value} ${topRight.x.value},${topRight.y.value} ` +
      `${bottomRight.x.value},${bottomRight.y.value} ${bottomLeft.x.value},${bottomLeft.y.value}`,
  }));

  const handleReset = () => {
    topLeft.x.value = 0;
    topLeft.y.value = 0;
    topRight.x.value = displayWidth;
    topRight.y.value = 0;
    bottomRight.x.value = displayWidth;
    bottomRight.y.value = displayHeight;
    bottomLeft.x.value = 0;
    bottomLeft.y.value = displayHeight;
  };

  const handleConfirm = () => {
    const scale = naturalWidth / displayWidth;
    const toNatural = (corner: Corner): Point => ({
      x: Math.round(corner.x.value * scale),
      y: Math.round(corner.y.value * scale),
    });
    onConfirm([toNatural(topLeft), toNatural(topRight), toNatural(bottomRight), toNatural(bottomLeft)]);
  };

  return (
    <Modal transparent animationType="fade">
      <GestureHandlerRootView style={styles.backdrop}>
        <View style={{ width: displayWidth, height: displayHeight }}>
          <Image source={{ uri }} style={{ width: displayWidth, height: displayHeight }} resizeMode="contain" />

          <Svg width={displayWidth} height={displayHeight} style={StyleSheet.absoluteFill} pointerEvents="none">
            <AnimatedPath animatedProps={maskProps} fill="rgba(0,0,0,.6)" fillRule="evenodd" />
            <AnimatedPolygon animatedProps={polygonProps} stroke={tokens.accent} strokeWidth={2} fill="none" />
          </Svg>

          <GestureDetector gesture={topLeftPan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, topLeftHandleStyle]} />
          </GestureDetector>
          <GestureDetector gesture={topRightPan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, topRightHandleStyle]} />
          </GestureDetector>
          <GestureDetector gesture={bottomRightPan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, bottomRightHandleStyle]} />
          </GestureDetector>
          <GestureDetector gesture={bottomLeftPan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, bottomLeftHandleStyle]} />
          </GestureDetector>
        </View>

        {stepLabel && <Text style={styles.stepLabel}>{stepLabel}</Text>}
        <Text style={styles.hint}>Drag each corner to match the page edges</Text>

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
    gap: spacing.lg,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 4,
    backgroundColor: '#fff',
  },
  stepLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  hint: {
    color: 'rgba(255,255,255,.65)',
    fontSize: 13,
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
