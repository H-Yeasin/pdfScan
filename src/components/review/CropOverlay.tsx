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
import { useT } from '../../i18n/useT';
import type { Point } from '../../services/enhance/perspective';

const HANDLE_SIZE = 28;
const HANDLE_HIT_SLOP = 16;
// Magnifier shown while a corner is dragged: the finger covers exactly the spot being placed.
const LOUPE_SIZE = 112;
const LOUPE_ZOOM = 2.5;
const LOUPE_GAP = 36; // between the finger's point and the loupe's edge
const LOUPE_BORDER = 3;
// Children are laid out inside the border, so the visual centre is at half the INNER size.
const LOUPE_CENTER = (LOUPE_SIZE - LOUPE_BORDER * 2) / 2;

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
  // the actual perspective warp (ReviewScreen runs warpPerspectiveCrop on confirm).
  onConfirm: (points: [Point, Point, Point, Point]) => void;
  onCancel: () => void;
  // Natural-pixel corners to start from (e.g. a detected page outline) instead of the full image.
  // Read once on mount - give the overlay a `key` per page when stepping through several.
  initialQuad?: [Point, Point, Point, Point];
  // Defaults to "Cancel"; the crop-check flow uses "Keep as is".
  cancelLabel?: string;
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
export function CropOverlay({
  uri,
  naturalWidth,
  naturalHeight,
  stepLabel,
  onConfirm,
  onCancel,
  initialQuad,
  cancelLabel,
}: CropOverlayProps) {
  const { tokens } = useTheme();
  const { t } = useT();
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

  // Natural -> display coordinates for initialQuad, clamped to the image.
  const toDisplay = (p: Point | undefined, fallbackX: number, fallbackY: number): [number, number] => {
    if (!p) return [fallbackX, fallbackY];
    const scale = displayWidth / naturalWidth;
    return [clamp(p.x * scale, 0, displayWidth), clamp(p.y * scale, 0, displayHeight)];
  };
  const topLeft = useCornerPoint(...toDisplay(initialQuad?.[0], 0, 0));
  const topRight = useCornerPoint(...toDisplay(initialQuad?.[1], displayWidth, 0));
  const bottomRight = useCornerPoint(...toDisplay(initialQuad?.[2], displayWidth, displayHeight));
  const bottomLeft = useCornerPoint(...toDisplay(initialQuad?.[3], 0, displayHeight));

  // The dragged corner's position, mirrored for the loupe (only one corner moves at a time).
  const loupeVisible = useSharedValue(0);
  const loupeX = useSharedValue(0);
  const loupeY = useSharedValue(0);

  const makeCornerPan = (corner: Corner) =>
    Gesture.Pan()
      .hitSlop(HANDLE_HIT_SLOP)
      .onStart(() => {
        corner.startX.value = corner.x.value;
        corner.startY.value = corner.y.value;
        loupeX.value = corner.x.value;
        loupeY.value = corner.y.value;
        loupeVisible.value = 1;
      })
      .onUpdate((e) => {
        corner.x.value = clamp(corner.startX.value + e.translationX, 0, displayWidth);
        corner.y.value = clamp(corner.startY.value + e.translationY, 0, displayHeight);
        loupeX.value = corner.x.value;
        loupeY.value = corner.y.value;
      })
      .onFinalize(() => {
        loupeVisible.value = 0;
      });

  // Above the finger, or below it when the corner is near the top edge.
  const loupeStyle = useAnimatedStyle(() => {
    const above = loupeY.value - LOUPE_GAP - LOUPE_SIZE;
    return {
      opacity: loupeVisible.value,
      left: loupeX.value - LOUPE_SIZE / 2,
      top: above >= -LOUPE_SIZE / 2 ? above : loupeY.value + LOUPE_GAP,
    };
  });
  // The zoomed image is shifted so the corner's point sits at the loupe's centre.
  const loupeImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: LOUPE_CENTER - loupeX.value * LOUPE_ZOOM },
      { translateY: LOUPE_CENTER - loupeY.value * LOUPE_ZOOM },
    ],
  }));

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
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
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

          <Animated.View style={[styles.loupe, { borderColor: tokens.accent }, loupeStyle]} pointerEvents="none">
            <Animated.Image
              source={{ uri }}
              style={[{ width: displayWidth * LOUPE_ZOOM, height: displayHeight * LOUPE_ZOOM }, loupeImageStyle]}
              resizeMode="stretch"
            />
            <View style={[styles.crosshairH, { backgroundColor: tokens.accent }]} />
            <View style={[styles.crosshairV, { backgroundColor: tokens.accent }]} />
          </Animated.View>
        </View>

        {stepLabel && <Text style={styles.stepLabel}>{stepLabel}</Text>}
        <Text style={styles.hint}>{t('review.crop.hint')}</Text>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={onCancel}>
            <Text style={styles.ghostLabel}>{cancelLabel ?? t('common.cancel')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={handleReset}>
            <Text style={styles.ghostLabel}>{t('review.crop.reset')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.primaryButton, { backgroundColor: tokens.accent }]} onPress={handleConfirm}>
            <Text style={styles.primaryLabel}>{t('review.crop.confirm')}</Text>
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
  loupe: {
    position: 'absolute',
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: LOUPE_SIZE / 2,
    borderWidth: LOUPE_BORDER,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  crosshairH: {
    position: 'absolute',
    left: LOUPE_CENTER - 10,
    top: LOUPE_CENTER - 1,
    width: 20,
    height: 2,
  },
  crosshairV: {
    position: 'absolute',
    left: LOUPE_CENTER - 1,
    top: LOUPE_CENTER - 10,
    width: 2,
    height: 20,
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
