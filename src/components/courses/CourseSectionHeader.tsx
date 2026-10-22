import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ICON_SIZE, MIN_TOUCH, spacing, useTheme } from '../../theme';
import { Badge, Divider, Text, Touchable } from '../ui';

type CourseSectionHeaderProps = {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  testID?: string;
};

// §17 U11: one of a course page's closed sections (Deadlines, Bookmarks, Submissions): its name and
// count, and a chevron. A tap opens it in place, under the header; TalkBack hears "expanded".
export const CourseSectionHeader = memo(function CourseSectionHeader({ title, count, open, onToggle, testID }: CourseSectionHeaderProps) {
  const { tokens } = useTheme();
  return (
    <View>
      <Divider />
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${count}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        scale={false}
        style={styles.row}
        testID={testID}
      >
        <Text variant="bodyStrong" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Badge count={count} tone={count ? 'accent' : 'neutral'} style={styles.badge} />
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={ICON_SIZE.row} color={tokens.muted} />
      </Touchable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  title: {
    flex: 1,
  },
  badge: {
    alignSelf: 'center',
  },
});
