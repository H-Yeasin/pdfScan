import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import type { Course } from '../../types/models';
import { CourseBadge } from './CourseBadge';
import { useT } from '../../i18n/useT';

const SHOWN = 3;

// Deliver's course choice: the top suggestions as one-tap chips (the selected course is always
// among them), then "More…" for the full picker.
export function CourseChips({
  courses,
  suggestions,
  selectedId,
  onSelect,
  onMore,
}: {
  courses: readonly Course[];
  suggestions: readonly string[];
  selectedId: string | null;
  onSelect: (courseId: string) => void;
  onMore: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const ids = suggestions.slice(0, SHOWN);
  if (selectedId && !ids.includes(selectedId)) ids.splice(SHOWN - 1, 1, selectedId);
  const shown = ids.map((id) => courses.find((c) => c.id === id)).filter((c): c is Course => !!c);

  const chipStyle = (selected: boolean) => [
    styles.chip,
    { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface },
  ];

  return (
    <View style={styles.wrap}>
      {shown.map((course) => {
        const selected = course.id === selectedId;
        return (
          <Pressable
            key={course.id}
            style={chipStyle(selected)}
            onPress={() => onSelect(course.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <CourseBadge course={course} size={22} />
            <Text style={[styles.label, { color: selected ? tokens.accentInk : tokens.ink }]} numberOfLines={1}>
              {course.code || course.name}
            </Text>
          </Pressable>
        );
      })}
      <Pressable style={chipStyle(false)} onPress={onMore} accessibilityRole="button">
        <Text style={[styles.label, { color: tokens.accentInk }]}>{t('courses.more')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 180,
    paddingLeft: 6,
    paddingRight: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
    flexShrink: 1,
  },
});
