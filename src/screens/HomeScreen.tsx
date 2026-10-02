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
import { useT } from '../i18n/useT';
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
import { useAppDispatch, useAppSlices, useAppStore } from '../store/AppStateContext';
import { fontFamily, radii, spacing, useTheme } from '../theme';
import type { Course } from '../types/models';
import { toLocalDateString } from '../utils/localDate';
import { formatShortDate } from '../utils/format';
import { useBackupReminder } from '../store/useBackupReminder';
import { EmptyState } from '../components/shared/EmptyState';
import { Hint } from '../components/shared/Hint';
import { useHint } from '../components/shared/useHint';

// The course hub (docs/PLAN.md §3): the shown semester with a switcher, "Continue" for the last
// opened or saved document, a grid of the semester's courses, Unsorted, and a big Scan button.
// All derived data comes from homeSelectors.ts.
export function HomeScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  const store = useAppStore();
  const { files, courses, semesters, homeSemesterId } = state.library;
  const openDocument = useOpenDocument();
  // §8 B5: "Last backup: never. Back up now?"
  const reminder = useBackupReminder();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [quickSetup, setQuickSetup] = useState(false);
  const [editing, setEditing] = useState<{ course?: Course } | null>(null);
  const [addingDeadline, setAddingDeadline] = useState(false);
  // §9 O3: points at Scan once (after onboarding, or on Capture if that comes first).
  const scanHint = useHint('scan', !switcherOpen && !quickSetup && editing === null && !addingDeadline);

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
    startScan(store.getState(), dispatch, null, { launch: true });
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
      { text: t('common.edit'), onPress: () => setEditing({ course }) },
      ...(index > 0 ? [{ text: t('home.moveEarlier'), onPress: () => move(-1) }] : []),
      ...(index < shownIds.length - 1 ? [{ text: t('home.moveLater'), onPress: () => move(1) }] : []),
      {
        text: t('home.archive'),
        onPress: () => {
          dispatch({ type: 'library/UPDATE_COURSE', id: course.id, patch: { archived: true } });
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('home.archived', { name: course.name }) });
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const courseName = (id: string | undefined) => (id ? courses.find((c) => c.id === id)?.name : undefined) ?? t('common.unsorted');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.semesterButton}
          onPress={() => setSwitcherOpen(true)}
          disabled={!shown}
          accessibilityRole="button"
          accessibilityLabel={shown ? t('home.semesterA11y', { name: shown.name }) : undefined}
        >
          <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
            {shown?.name ?? t('home.yourCourses')}
          </Text>
          {shown ? <Ionicons name="chevron-down" size={18} color={tokens.muted} /> : null}
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => go('settings')} accessibilityLabel={t('common.settings')}>
          <Ionicons name="settings-outline" size={21} color={tokens.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {reminder.due ? (
          <View style={[styles.backupCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            <Ionicons name="cloud-upload-outline" size={20} color={tokens.accentInk} />
            <Text style={[styles.backupText, { color: tokens.ink }]} numberOfLines={2}>
              {reminder.lastBackupAt === null
                ? t('backup.reminder.never')
                : t('backup.reminder.old', { date: formatShortDate(reminder.lastBackupAt) })}
            </Text>
            <Pressable onPress={reminder.snooze} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.backupAction, { color: tokens.muted }]}>{t('backup.reminder.later')}</Text>
            </Pressable>
            <Pressable
              onPress={() => dispatch({ type: 'ui/REQUEST_EXPORT', request: { scope: { kind: 'all' } } })}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={[styles.backupAction, { color: tokens.accent }]}>{t('backup.reminder.backUp')}</Text>
            </Pressable>
          </View>
        ) : null}
        {resume ? (
          <Pressable
            style={[styles.continueCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
            onPress={() => openDocument(resume.doc)}
            accessibilityRole="button"
          >
            <Ionicons name={resume.reason === 'opened' ? 'book-outline' : 'document-text-outline'} size={22} color={tokens.accentInk} />
            <View style={styles.flex}>
              <Text style={[styles.overline, { color: tokens.muted }]}>
                {resume.reason === 'opened' ? t('home.continueReading') : t('home.latestScan')}
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
              <Text style={[styles.overline, { color: tokens.muted }]}>{t('home.dueSoon')}</Text>
              <Pressable onPress={() => setAddingDeadline(true)} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.addDeadline, { color: tokens.accentInk }]}>{t('home.addDeadline')}</Text>
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
              <EmptyState variant="inline" title={t('home.nothingDue')} body={t('home.nothingDueBody')} />
            )}
          </View>
        ) : null}

        {!hasActiveCourse ? (
          <View style={[styles.emptyCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            <EmptyState
              variant="inline"
              title={t('home.emptyTitle')}
              body={t('home.emptyBody')}
              action={{ label: t('home.emptyButton'), onPress: () => setQuickSetup(true) }}
            />
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
                  accessibilityHint={t('home.courseHint')}
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
                    {stats ? `${t('home.docCount', { count: stats.count })} · ${relativeDay(stats.lastScanAt!, now)}` : t('home.noScansYet')}
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
              <Text style={[styles.addLabel, { color: tokens.accentInk }]}>{t('home.addCourse')}</Text>
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
            <Text style={[styles.cardTitle, styles.flex, { color: tokens.ink }]}>{t('home.unsortedCount', { count: activity.unsorted.count })}</Text>
            <Ionicons name="chevron-forward" size={18} color={tokens.muted} />
          </Pressable>
        ) : null}
      </ScrollView>

      <DeadlineEditorSheet visible={addingDeadline} onClose={() => setAddingDeadline(false)} />

      {scanHint.visible ? (
        <Hint text={t('shared.hint.scan')} onDismiss={scanHint.dismiss} arrow="down" style={styles.scanHint} />
      ) : null}
      <Pressable
        style={[styles.scanButton, { backgroundColor: tokens.accent }]}
        onPress={handleScan}
        accessibilityRole="button"
        accessibilityLabel={t('common.scan')}
      >
        <Ionicons name="scan" size={22} color="#fff" />
        <Text style={styles.scanLabel}>{t('common.scan')}</Text>
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
  backupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  backupText: {
    flex: 1,
    fontSize: 13.5,
  },
  backupAction: {
    fontSize: 14,
    fontWeight: '700',
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
    padding: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scanHint: {
    alignSelf: 'center',
    marginBottom: spacing.md,
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
