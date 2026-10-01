import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CourseBadge } from '../components/courses/CourseBadge';
import { CourseEditorSheet } from '../components/courses/CourseEditorSheet';
import { UNSORTED_COURSE_ID } from '../components/courses/CourseList';
import { QuickSetupSheet } from '../components/courses/QuickSetupSheet';
import { SemesterSwitcher } from '../components/courses/SemesterSwitcher';
import { useOpenDocument } from '../components/library/useDocumentListActions';
import { DeadlineEditorSheet } from '../components/deadlines/DeadlineEditorSheet';
import { DeadlineList } from '../components/deadlines/DeadlineList';
import { dueSoon } from '../services/submit/deadlines';
import { TabBar } from '../components/shared/TabBar';
import { useRouter } from '../navigation/router';
import {
  continueDocument,
  courseActivity,
  currentSemester,
  homeCourses,
  homeSemester,
  moveCourse,
  relativeDay,
} from '../services/courses/homeSelectors';
import { courseColorValue } from '../services/courses/palette';
import { startScan } from '../services/courses/startScan';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, radii, spacing, useTheme } from '../theme';
import type { Course } from '../types/models';
import { toLocalDateString } from '../utils/localDate';

// The course hub (docs/PLAN.md §3): the shown semester with a switcher, "Continue" for the last
// opened or saved document, a grid of the semester's courses, Unsorted, and a big Scan button.
// All derived data comes from homeSelectors.ts.
export function HomeScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { files, courses, semesters, homeSemesterId } = state.library;
  const openDocument = useOpenDocument();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [quickSetup, setQuickSetup] = useState(false);
  const [editing, setEditing] = useState<{ course?: Course } | null>(null);
  const [addingDeadline, setAddingDeadline] = useState(false);

  const now = Date.now();
  const today = toLocalDateString(now);
  const current = useMemo(() => currentSemester(semesters, today), [semesters, today]);
  const shown = useMemo(() => homeSemester(semesters, homeSemesterId, today), [semesters, homeSemesterId, today]);
  const gridCourses = useMemo(() => homeCourses(courses, shown), [courses, shown]);
  const activity = useMemo(() => courseActivity(files), [files]);
  const resume = useMemo(() => continueDocument(files, state.settings.lastOpened), [files, state.settings.lastOpened]);
  const hasActiveCourse = courses.some((c) => !c.archived);
  // §4 S8: the next 7 days' deadlines, overdue first.
  const soon = useMemo(() => dueSoon(state.library.deadlines, now), [state.library.deadlines, now]);

  const openCourse = (id: string) => {
    dispatch({ type: 'library/SET_ACTIVE_COURSE', id });
    go('course');
  };

  const handleScan = () => {
    startScan(state, dispatch, null, { launch: true });
    go('capture');
  };

  const handleCourseMenu = (course: Course) => {
    const shownIds = gridCourses.map((c) => c.id);
    const move = (step: -1 | 1) => {
      const ids = moveCourse(courses, shownIds, course.id, step);
      if (ids) dispatch({ type: 'library/REORDER_COURSES', ids });
    };
    const index = shownIds.indexOf(course.id);
    Alert.alert(course.name, undefined, [
      { text: 'Edit', onPress: () => setEditing({ course }) },
      ...(index > 0 ? [{ text: 'Move earlier', onPress: () => move(-1) }] : []),
      ...(index < shownIds.length - 1 ? [{ text: 'Move later', onPress: () => move(1) }] : []),
      {
        text: 'Archive',
        onPress: () => {
          dispatch({ type: 'library/UPDATE_COURSE', id: course.id, patch: { archived: true } });
          dispatch({ type: 'ui/SHOW_SNACK', msg: `${course.name} archived` });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const courseName = (id: string | undefined) => (id ? courses.find((c) => c.id === id)?.name : undefined) ?? 'Unsorted';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.semesterButton}
          onPress={() => setSwitcherOpen(true)}
          disabled={!shown}
          accessibilityRole="button"
          accessibilityLabel={shown ? `Semester: ${shown.name}. Change` : undefined}
        >
          <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
            {shown?.name ?? 'Your courses'}
          </Text>
          {shown ? <Ionicons name="chevron-down" size={18} color={tokens.muted} /> : null}
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => go('settings')} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={21} color={tokens.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {resume ? (
          <Pressable
            style={[styles.continueCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
            onPress={() => openDocument(resume.doc)}
            accessibilityRole="button"
          >
            <Ionicons name={resume.reason === 'opened' ? 'book-outline' : 'document-text-outline'} size={22} color={tokens.accentInk} />
            <View style={styles.flex}>
              <Text style={[styles.overline, { color: tokens.muted }]}>
                {resume.reason === 'opened' ? 'Continue reading' : 'Latest scan'}
              </Text>
              <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={1}>
                {resume.doc.name}
              </Text>
              <Text style={[styles.meta, { color: tokens.muted }]} numberOfLines={1}>
                {courseName(resume.doc.courseId)} · {relativeDay(resume.doc.createdAt, now)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={tokens.muted} />
          </Pressable>
        ) : null}

        {hasActiveCourse ? (
          <View style={styles.dueSoon}>
            <View style={styles.dueSoonHeader}>
              <Text style={[styles.overline, { color: tokens.muted }]}>Due soon</Text>
              <Pressable onPress={() => setAddingDeadline(true)} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.addDeadline, { color: tokens.accentInk }]}>+ Add deadline</Text>
              </Pressable>
            </View>
            {soon.length > 0 ? (
              <DeadlineList
                deadlines={soon}
                now={now}
                courseLabel={(d) => {
                  const c = courses.find((x) => x.id === d.courseId);
                  return c?.code || c?.name;
                }}
                onPress={(d) => {
                  dispatch({ type: 'library/SET_HIGHLIGHT_DEADLINE', id: d.id });
                  openCourse(d.courseId);
                }}
              />
            ) : (
              <Text style={[styles.meta, { color: tokens.muted }]}>Nothing due in the next 7 days.</Text>
            )}
          </View>
        ) : null}

        {!hasActiveCourse ? (
          <View style={[styles.emptyCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            <Text style={[styles.emptyTitle, { color: tokens.ink }]}>Add your courses</Text>
            <Text style={[styles.meta, styles.center, { color: tokens.muted }]}>
              Each scan gets filed under a course, so a subject's notes and handouts stay together.
            </Text>
            <Pressable style={[styles.pill, { backgroundColor: tokens.accent }]} onPress={() => setQuickSetup(true)}>
              <Text style={styles.pillLabel}>Add your courses</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {gridCourses.map((course) => {
              const color = courseColorValue(course.color, tokens);
              const stats = activity.byCourse.get(course.id);
              return (
                <Pressable
                  key={course.id}
                  style={[styles.courseCard, { backgroundColor: tokens.surface, borderColor: tokens.edge, borderTopColor: color }]}
                  onPress={() => openCourse(course.id)}
                  onLongPress={() => handleCourseMenu(course)}
                  delayLongPress={400}
                  accessibilityRole="button"
                  accessibilityHint="Long-press to edit, reorder or archive"
                >
                  <CourseBadge course={course} size={36} />
                  {course.code ? (
                    <Text style={[styles.code, { color }]} numberOfLines={1}>
                      {course.code}
                    </Text>
                  ) : null}
                  <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
                    {course.name}
                  </Text>
                  <Text style={[styles.meta, { color: tokens.muted }]} numberOfLines={1}>
                    {stats ? `${stats.count} ${stats.count === 1 ? 'doc' : 'docs'} · ${relativeDay(stats.lastScanAt!, now)}` : 'No scans yet'}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.courseCard, styles.addCard, { borderColor: tokens.edge }]}
              onPress={() => setEditing({})}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={24} color={tokens.accentInk} />
              <Text style={[styles.addLabel, { color: tokens.accentInk }]}>Add course</Text>
            </Pressable>
          </View>
        )}

        {activity.unsorted.count > 0 ? (
          <Pressable
            style={[styles.unsortedCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
            onPress={() => openCourse(UNSORTED_COURSE_ID)}
            accessibilityRole="button"
          >
            <Ionicons name="file-tray-outline" size={20} color={tokens.muted} />
            <Text style={[styles.cardTitle, styles.flex, { color: tokens.ink }]}>Unsorted ({activity.unsorted.count})</Text>
            <Ionicons name="chevron-forward" size={18} color={tokens.muted} />
          </Pressable>
        ) : null}
      </ScrollView>

      <DeadlineEditorSheet visible={addingDeadline} onClose={() => setAddingDeadline(false)} />

      <Pressable
        style={[styles.scanButton, { backgroundColor: tokens.accent }]}
        onPress={handleScan}
        accessibilityRole="button"
        accessibilityLabel="Scan"
      >
        <Ionicons name="scan" size={22} color="#fff" />
        <Text style={styles.scanLabel}>Scan</Text>
      </Pressable>

      <TabBar active="home" background={tokens.surface} activeColor={tokens.ink} inactiveColor={tokens.muted} accent={tokens.accent} />

      <SemesterSwitcher visible={switcherOpen} shown={shown} current={current} onClose={() => setSwitcherOpen(false)} />
      <QuickSetupSheet visible={quickSetup} onClose={() => setQuickSetup(false)} />
      <CourseEditorSheet visible={editing !== null} course={editing?.course} onClose={() => setEditing(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  center: {
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.xl,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
  },
  semesterButton: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 26,
    flexShrink: 1,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  courseCard: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md,
    minHeight: 132,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 4,
  },
  code: {
    marginTop: spacing.xs,
    fontSize: 12.5,
    fontWeight: '700',
  },
  addCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addLabel: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  unsortedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
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
  },
  pill: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  pillLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  scanButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md + 4,
    borderRadius: radii.full,
    elevation: 4,
  },
  scanLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  dueSoon: {
    gap: spacing.sm,
  },
  dueSoonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addDeadline: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
