import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { courseColorValue } from '../../services/courses/palette';
import { radii, spacing, useTheme } from '../../theme';
import type { Course, LibraryDocument } from '../../types/models';
import { UNSORTED_COURSE_ID } from './CourseList';

// Search results by course (§3 K6): "All" plus each course the results come from, with counts.
// `value` is a course id, UNSORTED_COURSE_ID, or null for all. Hidden when the results come from
// a single course (nothing to filter), unless a filter is on, so it can be cleared.
export function CourseFilterChips({
  docs,
  courses,
  value,
  onChange,
}: {
  docs: readonly Pick<LibraryDocument, 'courseId'>[];
  courses: readonly Course[];
  value: string | null;
  onChange: (courseId: string | null) => void;
}) {
  const { tokens } = useTheme();
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const key = doc.courseId ?? UNSORTED_COURSE_ID;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size < 2 && value === null) return null;
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const chip = (key: string | null, label: string, count: number, color?: string) => {
    const selected = value === key;
    return (
      <Pressable
        key={key ?? 'all'}
        onPress={() => onChange(selected ? null : key)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={[styles.chip, { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface }]}
      >
        {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
        <Text style={[styles.label, { color: selected ? tokens.accentInk : tokens.ink }]}>{`${label} ${count}`}</Text>
      </Pressable>
    );
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {chip(null, 'All courses', docs.length)}
      {entries.map(([key, count]) => {
        const course = courses.find((c) => c.id === key);
        return chip(key, course ? course.code || course.name : 'Unsorted', count, course ? courseColorValue(course.color, tokens) : undefined);
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
