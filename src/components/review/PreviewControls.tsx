import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typeScale } from '../../theme';

const ARROW_SIZE = 36;

type PreviewControlsProps = {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  showCompare: boolean;
  comparing: boolean;
  onCompareIn: () => void;
  onCompareOut: () => void;
};

// Prev/next dock to the preview's left/right edges (classic image-viewer placement) rather than
// bundling into a single corner pill with a page-count — no number to read, just tap a side.
// Compare stays as its own bottom-center pill, independent of page count.
export function PreviewControls({
  index,
  total,
  onPrev,
  onNext,
  showCompare,
  comparing,
  onCompareIn,
  onCompareOut,
}: PreviewControlsProps) {
  const showNav = total > 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {showNav && (
        <Pressable
          hitSlop={8}
          disabled={index === 0}
          onPress={onPrev}
          style={[styles.edgeButton, styles.edgeButtonLeft]}
        >
          <Ionicons name="chevron-back" size={20} color={index === 0 ? 'rgba(255,255,255,.35)' : '#fff'} />
        </Pressable>
      )}
      {showNav && (
        <Pressable
          hitSlop={8}
          disabled={index === total - 1}
          onPress={onNext}
          style={[styles.edgeButton, styles.edgeButtonRight]}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={index === total - 1 ? 'rgba(255,255,255,.35)' : '#fff'}
          />
        </Pressable>
      )}
      {showCompare && (
        <Pressable
          onPressIn={onCompareIn}
          onPressOut={onCompareOut}
          style={[styles.comparePill, comparing && styles.comparePillActive]}
        >
          <Ionicons name="eye-outline" size={15} color="#fff" />
          <Text style={styles.compareLabel}>Compare</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  edgeButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -ARROW_SIZE / 2,
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,.45)',
  },
  edgeButtonLeft: {
    left: spacing.xs,
  },
  edgeButtonRight: {
    right: spacing.xs,
  },
  comparePill: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    width: 100,
    marginHorizontal: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: 'rgba(0,0,0,.55)',
  },
  comparePillActive: {
    backgroundColor: 'rgba(0,0,0,.8)',
  },
  compareLabel: {
    color: '#fff',
    fontSize: typeScale.label.fontSize,
    fontFamily: typeScale.label.fontFamily,
    fontWeight: '600',
  },
});
