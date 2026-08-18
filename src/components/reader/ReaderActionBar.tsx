import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typeScale, useTheme } from '../../theme';
import type { OverflowItemId } from './OverflowSheet';

type Item = { id: OverflowItemId; label: string; icon: keyof typeof Ionicons.glyphMap };

const ITEMS: Item[] = [
  { id: 'share', label: 'Share', icon: 'share-outline' },
  { id: 'sign', label: 'Sign', icon: 'create-outline' },
  { id: 'export', label: 'Export', icon: 'download-outline' },
  { id: 'print', label: 'Print', icon: 'print-outline' },
];

type ReaderActionBarProps = {
  visible: Animated.Value;
  onPress: (id: OverflowItemId) => void;
  hiddenIds?: OverflowItemId[];
};

// Persistent, full-width icon row for the reader's non-destructive actions (Share/Sign/Export/
// Print), styled after CamScanner's bottom toolbar. Delete stays behind the overflow sheet so
// there's exactly one, deliberately-gated path to a destructive action.
export function ReaderActionBar({ visible, onPress, hiddenIds }: ReaderActionBarProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const items = hiddenIds?.length ? ITEMS.filter((item) => !hiddenIds.includes(item.id)) : ITEMS;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: tokens.surface,
          borderTopColor: tokens.edge,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          opacity: visible,
          transform: [{ translateY: visible.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        {items.map((item) => (
          <Pressable key={item.id} style={styles.item} onPress={() => onPress(item.id)}>
            <Ionicons name={item.icon} size={21} color={tokens.ink} />
            <Text style={[styles.label, { color: tokens.ink }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  item: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontFamily: typeScale.label.fontFamily,
    fontWeight: '600',
  },
});
