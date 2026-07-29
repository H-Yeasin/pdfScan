import { useMemo } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { radii, spacing, useTheme } from '../../theme';

const HANDLE_SIZE = 28;
const MIN_SIGNATURE_WIDTH = 60;
const INITIAL_WIDTH_RATIO = 0.35; // starting size relative to the displayed page width

type SignaturePlacementOverlayProps = {
  pageUri: string;
  pageNaturalWidth: number;
  pageNaturalHeight: number;
  signatureUri: string;
  signatureAspectRatio: number; // height / width, from the capture step
  onConfirm: (placement: { originX: number; originY: number; width: number; height: number }) => void;
  onCancel: () => void;
};

// Step 2 of the two-step PDF signing flow: drag/resize the captured signature over the target
// page. Modeled on CropOverlay's aspect-fit + shared-value + Gesture.Pan idiom, but moves/resizes
// a signature image instead of a crop rect, and resize is aspect-locked to the signature's own
// proportions rather than free-stretch, so the ink never looks squashed.
export function SignaturePlacementOverlay({
  pageUri,
  pageNaturalWidth,
  pageNaturalHeight,
  signatureUri,
  signatureAspectRatio,
  onConfirm,
  onCancel,
}: SignaturePlacementOverlayProps) {
  const { tokens } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const { displayWidth, displayHeight } = useMemo(() => {
    const maxWidth = screenWidth - spacing.xl * 2;
    const maxHeight = screenHeight * 0.62;
    const ratio = pageNaturalHeight / pageNaturalWidth;
    let w = maxWidth;
    let h = w * ratio;
    if (h > maxHeight) {
      h = maxHeight;
      w = h / ratio;
    }
    return { displayWidth: w, displayHeight: h };
  }, [screenWidth, screenHeight, pageNaturalWidth, pageNaturalHeight]);

  const initialWidth = displayWidth * INITIAL_WIDTH_RATIO;
  const initialHeight = initialWidth * signatureAspectRatio;

  const left = useSharedValue((displayWidth - initialWidth) / 2);
  const top = useSharedValue(displayHeight - initialHeight - 24);
  const width = useSharedValue(initialWidth);
  const height = useSharedValue(initialHeight);
  const startLeft = useSharedValue(0);
  const startTop = useSharedValue(0);
  const startWidth = useSharedValue(0);

  const movePan = Gesture.Pan()
    .onStart(() => {
      startLeft.value = left.value;
      startTop.value = top.value;
    })
    .onUpdate((e) => {
      left.value = clamp(startLeft.value + e.translationX, 0, displayWidth - width.value);
      top.value = clamp(startTop.value + e.translationY, 0, displayHeight - height.value);
    });

  const resizePan = Gesture.Pan()
    .onStart(() => {
      startWidth.value = width.value;
    })
    .onUpdate((e) => {
      const maxWidthForBounds = displayWidth - left.value;
      const maxWidthForHeight = (displayHeight - top.value) / signatureAspectRatio;
      const maxWidth = Math.min(maxWidthForBounds, maxWidthForHeight);
      const newWidth = clamp(startWidth.value + e.translationX, MIN_SIGNATURE_WIDTH, maxWidth);
      width.value = newWidth;
      height.value = newWidth * signatureAspectRatio;
    });

  const boxStyle = useAnimatedStyle(() => ({
    left: left.value,
    top: top.value,
    width: width.value,
    height: height.value,
  }));
  const handleStyle = useAnimatedStyle(() => ({
    left: left.value + width.value - HANDLE_SIZE / 2,
    top: top.value + height.value - HANDLE_SIZE / 2,
  }));

  const handleConfirm = () => {
    const scale = pageNaturalWidth / displayWidth;
    onConfirm({
      originX: Math.round(left.value * scale),
      originY: Math.round(top.value * scale),
      width: Math.round(width.value * scale),
      height: Math.round(height.value * scale),
    });
  };

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={{ width: displayWidth, height: displayHeight }}>
          <Image source={{ uri: pageUri }} style={{ width: displayWidth, height: displayHeight }} resizeMode="contain" />

          <GestureDetector gesture={movePan}>
            <Animated.View style={[styles.box, { borderColor: tokens.accent }, boxStyle]}>
              <Image source={{ uri: signatureUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </Animated.View>
          </GestureDetector>

          <GestureDetector gesture={resizePan}>
            <Animated.View style={[styles.handle, { borderColor: tokens.accent }, handleStyle]} />
          </GestureDetector>
        </View>

        <Text style={styles.hint}>Drag to move · drag corner to resize</Text>

        <View style={styles.actions}>
          <Pressable style={styles.ghostButton} onPress={onCancel}>
            <Text style={styles.ghostLabel}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, { backgroundColor: tokens.accent }]} onPress={handleConfirm}>
            <Text style={styles.primaryLabel}>Place signature</Text>
          </Pressable>
        </View>
      </View>
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
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 4,
    backgroundColor: '#fff',
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
