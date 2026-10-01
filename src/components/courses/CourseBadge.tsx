import { StyleSheet, Text, View } from 'react-native';
import { courseColorValue } from '../../services/courses/palette';
import { useTheme } from '../../theme';
import type { Course } from '../../types/models';

// A course's round mark: its emoji, or the first letter of its code/name, on a tint of its colour.
export function CourseBadge({ course, size = 36 }: { course: Pick<Course, 'name' | 'code' | 'emoji' | 'color'>; size?: number }) {
  const { tokens } = useTheme();
  const color = courseColorValue(course.color, tokens);
  const letter = (course.code || course.name).trim().charAt(0).toUpperCase();
  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}26`, borderColor: color }]}
    >
      <Text style={[styles.label, { fontSize: size * 0.45, color }]}>{course.emoji || letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  label: {
    fontWeight: '700',
  },
});
