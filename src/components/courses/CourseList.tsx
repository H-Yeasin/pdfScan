import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { fontFamily, radii, spacing, useTheme } from '../../theme';
import type { Course } from '../../types/models';
import { CourseBadge } from './CourseBadge';
import { CourseEditorSheet } from './CourseEditorSheet';
import { QuickSetupSheet } from './QuickSetupSheet';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';

// Sentinel id for the synthetic "Unsorted" bucket — never a real Course.id,
// so it can share the same activeCourseId slot as real course ids.
export const UNSORTED_COURSE_ID = '__unsorted__';

type CourseListProps = {
  counts: Record<string, number>;
  unsortedCount: number;
  onOpenCourse?: (id: string) => void;
};

function pluralFiles(n: number): string {
  return t('courses.files', { count: n });
}

// The course list with everything to manage it: create (one, or several with Quick setup), edit,
// archive and delete. Archived courses are hidden behind "Show archived"; their documents stay in
// the library and in search either way. Reads courses from the store, so every screen that shows
// it (Library's Courses tab, Manage courses, K2's Home) behaves the same.
export function CourseList({ counts, unsortedCount, onOpenCourse }: CourseListProps) {
  const { tokens } = useTheme();
  // t is imported (pluralFiles uses it too); this re-renders on a language change.
  useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const { courses, files } = state.library;

  const [editing, setEditing] = useState<{ course?: Course } | null>(null);
  const [quickSetup, setQuickSetup] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);
  const shown = showArchived ? [...active, ...archived] : active;

  const handleMenu = (course: Course) => {
    Alert.alert(course.name, undefined, [
      { text: t('courses.edit'), onPress: () => setEditing({ course }) },
      {
        text: course.archived ? t('courses.unarchive') : t('courses.archive'),
        onPress: () => dispatch({ type: 'library/UPDATE_COURSE', id: course.id, patch: { archived: !course.archived } }),
      },
      {
        text: t('courses.delete'),
        style: 'destructive',
        onPress: () => {
          // K6: say what happens to its documents, and offer archiving, which keeps them together.
          const count = files.filter((f) => f.courseId === course.id).length;
          const body =
            count === 0
              ? t('courses.deleteEmpty')
              : t('courses.deleteBody', { count });
          Alert.alert(t('courses.deleteTitle', { name: course.name }), body, [
            { text: t('common.cancel'), style: 'cancel' },
            ...(course.archived || count === 0
              ? []
              : [
                  {
                    text: t('courses.archiveInstead'),
                    onPress: () => dispatch({ type: 'library/UPDATE_COURSE', id: course.id, patch: { archived: true } }),
                  },
                ]),
            { text: t('courses.delete'), style: 'destructive', onPress: () => dispatch({ type: 'library/DELETE_COURSE', id: course.id }) },
          ]);
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const subtitle = (course: Course) =>
    [course.code, course.teacher, pluralFiles(counts[course.id] ?? 0)].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      {courses.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.emptyTitle, { color: tokens.ink }]}>{t('courses.emptyTitle')}</Text>
          <Text style={[styles.emptyBody, { color: tokens.muted }]}>{t('courses.emptyBody')}</Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: tokens.accent }]}
            onPress={() => setQuickSetup(true)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryLabel}>{t('courses.emptyTitle')}</Text>
          </Pressable>
        </View>
      ) : null}

      {unsortedCount > 0 && (
        <Pressable accessibilityRole="button"
          style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
          onPress={() => onOpenCourse?.(UNSORTED_COURSE_ID)}
          disabled={!onOpenCourse}
        >
          <View style={[styles.unsortedBadge, { borderColor: tokens.edge }]}>
            <Ionicons name="file-tray-outline" size={18} color={tokens.muted} />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: tokens.ink }]}>{t('common.unsorted')}</Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{pluralFiles(unsortedCount)}</Text>
          </View>
          {onOpenCourse ? <Ionicons name="chevron-forward" size={18} color={tokens.muted} /> : null}
        </Pressable>
      )}

      {shown.map((course) => (
        <Pressable accessibilityRole="button"
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
          <Pressable accessibilityRole="button" onPress={() => handleMenu(course)} hitSlop={8} accessibilityLabel={t('courses.options', { name: course.name })}>
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
            <Text style={[styles.newLabel, { color: tokens.accentInk }]}>{t('courses.newCourse')}</Text>
          </Pressable>
          <Pressable
            style={[styles.newRow, { borderColor: tokens.edge }]}
            onPress={() => setQuickSetup(true)}
            accessibilityRole="button"
          >
            <Ionicons name="list" size={18} color={tokens.accentInk} />
            <Text style={[styles.newLabel, { color: tokens.accentInk }]}>{t('courses.addSeveral')}</Text>
          </Pressable>
        </View>
      ) : null}

      {archived.length > 0 ? (
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: tokens.muted }]}>{t('courses.showArchived', { count: archived.length })}</Text>
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
