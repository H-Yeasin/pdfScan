import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../../theme';

type ReaderBottomChromeProps = {
  visible: Animated.Value;
  pageCount: number;
  activeIndex: number;
  onFind: () => void;
  findOpen: boolean;
  onNight: () => void;
  nightOn: boolean;
};

export function ReaderBottomChrome({
  visible,
  pageCount,
  activeIndex,
  onFind,
  findOpen,
  onNight,
  nightOn,
}: ReaderBottomChromeProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: tokens.surface,
          borderColor: tokens.edge,
          bottom: Math.max(insets.bottom, spacing.md),
          opacity: visible,
          transform: [{ translateY: visible.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.dots}>
        {Array.from({ length: Math.min(pageCount, 8) }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: i === activeIndex ? tokens.accent : tokens.edge }]}
          />
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={onFind}>
          <Ionicons name="search" size={17} color={findOpen ? tokens.accent : tokens.ink} />
          <Text style={[styles.actionLabel, { color: findOpen ? tokens.accent : tokens.ink }]}>Find</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onNight}>
          <Ionicons name="moon-outline" size={17} color={nightOn ? tokens.accent : tokens.ink} />
          <Text style={[styles.actionLabel, { color: nightOn ? tokens.accent : tokens.ink }]}>Night</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
  },
  actionLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
