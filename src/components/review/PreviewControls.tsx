import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typeScale } from '../../theme';

type PreviewControlsProps = {
  showCompare: boolean;
  comparing: boolean;
  onCompareIn: () => void;
  onCompareOut: () => void;
};

// Compare stays as its own bottom-center pill. Page navigation is handled by swiping the
// preview itself (see ZoomableImage's onSwipeLeft/onSwipeRight) rather than on-screen buttons.
export function PreviewControls({ showCompare, comparing, onCompareIn, onCompareOut }: PreviewControlsProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
