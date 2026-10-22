import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../theme';
import { Text } from '../ui';

// §17 U6: a Home section's title row, with an optional action on the right ("See all", "Add a
// deadline").
export function SectionHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="overline" color="muted" accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 36,
  },
  title: {
    flexShrink: 1,
  },
});
