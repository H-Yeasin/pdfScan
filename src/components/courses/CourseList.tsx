import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useAppState } from '../../store/AppStateContext';
import { fontFamily, radii, spacing, useTheme } from '../../theme';
import type { Course } from '../../types/models';
import { CourseBadge } from './CourseBadge';
import { CourseEditorSheet } from './CourseEditorSheet';
import { QuickSetupSheet } from './QuickSetupSheet';

// Sentinel id for the synthetic "Unsorted" bucket — never a real Course.id,
// so it can share the same activeCourseId slot as real course ids.
export const UNSORTED_COURSE_ID = '__unsorted__';

type CourseListProps = {
  counts: Record<string, number>;
  unsortedCount: number;
  onOpenCourse?: (id: string) => void;
};

function pluralFiles(n: number): string {
  return `${n} ${n === 1 ? 'file' : 'files'}`;
}

// The course list with everything to manage it: create (one, or several with Quick setup), edit,
// archive and delete. Archived courses are hidden behind "Show archived"; their documents stay in
// the library and in search either way. Reads courses from the store, so every screen that shows
// it (Library's Courses tab, Manage courses, K2's Home) behaves the same.
export function CourseList({ counts, unsortedCount, onOpenCourse }: CourseListProps) {
  const { tokens } = useTheme();
  const { state, dispatch } = useAppState();
  const { courses, files } = state.library;

  const [editing, setEditing] = useState<{ course?: Course } | null>(null);
  const [quickSetup, setQuickSetup] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);
  const shown = showArchived ? [...active, ...archived] : active;

  const handleMenu = (course: Course) => {
    Alert.alert(course.name, undefined, [
      { text: 'Edit', onPress: () => setEditing({ course }) },
      {
        text: course.archived ? 'Unarchive' : 'Archive',
        onPress: () => dispatch({ type: 'library/UPDATE_COURSE', id: course.id, patch: { archived: !course.archived } }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // K6: say what happens to its documents, and offer archiving, which keeps them together.
          const count = files.filter((f) => f.courseId === course.id).length;
          const body =
            count === 0
              ? 'It has no documents.'
              : `Its ${count} ${count === 1 ? 'document moves' : 'documents move'} to Unsorted; nothing is deleted. Archiving keeps them together under the course instead.`;
          Alert.alert(`Delete ${course.name}?`, body, [
            { text: 'Cancel', style: 'cancel' },
            ...(course.archived || count === 0
              ? []
              : [
                  {
                    text: 'Archive instead',
                    onPress: () => dispatch({ type: 'library/UPDATE_COURSE', id: course.id, patch: { archived: true } }),
                  },
                ]),
            { text: 'Delete', style: 'destructive', onPress: () => dispatch({ type: 'library/DELETE_COURSE', id: course.id }) },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const subtitle = (course: Course) =>
    [course.code, course.teacher, pluralFiles(counts[course.id] ?? 0)].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      {courses.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.emptyTitle, { color: tokens.ink }]}>Add your courses</Text>
          <Text style={[styles.emptyBody, { color: tokens.muted }]}>
            Scans get filed under a course, so each subject's notes and handouts stay together.
          </Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: tokens.accent }]}
            onPress={() => setQuickSetup(true)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryLabel}>Add your courses</Text>
          </Pressable>
        </View>
      ) : null}

      {unsortedCount > 0 && (
        <Pressable
          style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
          onPress={() => onOpenCourse?.(UNSORTED_COURSE_ID)}
          disabled={!onOpenCourse}
        >
          <View style={[styles.unsortedBadge, { borderColor: tokens.edge }]}>
            <Ionicons name="file-tray-outline" size={18} color={tokens.muted} />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: tokens.ink }]}>Unsorted</Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{pluralFiles(unsortedCount)}</Text>
          </View>
          {onOpenCourse ? <Ionicons name="chevron-forward" size={18} color={tokens.muted} /> : null}
        </Pressable>
      )}

      {shown.map((course) => (
        <Pressable
          key={course.id}
          style={[
            styles.row,
            { backgroundColor: tokens.surface, borderColor: tokens.edge, opacity: course.archived ? 0.6 : 1 },
          ]}
          onPress={() => (onOpenCourse ? onOpenCourse(course.id) : setEditing({ course }))}
          onLongPress={() => handleMenu(course)}
          delayLongPress={400}
        >
          <CourseBadge course={course} />
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
              {course.name}
              {course.archived ? <Text style={{ color: tokens.muted }}>  · Archived</Text> : null}
            </Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]} numberOfLines={1}>
              {subtitle(course)}
            </Text>
          </View>
          <Pressable onPress={() => handleMenu(course)} hitSlop={8} accessibilityLabel={`${course.name} options`}>
            <Ionicons name="ellipsis-horizontal" size={18} color={tokens.muted} />
          </Pressable>
        </Pressable>
      ))}

      {courses.length > 0 ? (
        <View style={styles.newRowGroup}>
          <Pressable
            style={[styles.newRow, { borderColor: tokens.edge }]}
            onPress={() => setEditing({})}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={tokens.accentInk} />
            <Text style={[styles.newLabel, { color: tokens.accentInk }]}>New course</Text>
          </Pressable>
          <Pressable
            style={[styles.newRow, { borderColor: tokens.edge }]}
            onPress={() => setQuickSetup(true)}
            accessibilityRole="button"
          >
            <Ionicons name="list" size={18} color={tokens.accentInk} />
            <Text style={[styles.newLabel, { color: tokens.accentInk }]}>Add several</Text>
          </Pressable>
        </View>
      ) : null}

      {archived.length > 0 ? (
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: tokens.muted }]}>Show archived ({archived.length})</Text>
          <Switch value={showArchived} onValueChange={setShowArchived} trackColor={{ true: tokens.accent }} />
        </View>
      ) : null}

      <CourseEditorSheet visible={editing !== null} course={editing?.course} onClose={() => setEditing(null)} />
      <QuickSetupSheet visible={quickSetup} onClose={() => setQuickSetup(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 22,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  unsortedBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15.5,
  },
  subtitle: {
    fontSize: 13.5,
  },
  newRowGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  newRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  newLabel: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
  },
  switchLabel: {
    fontSize: 14,
  },
});
