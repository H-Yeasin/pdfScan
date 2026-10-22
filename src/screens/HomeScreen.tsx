import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BannerSlot } from '../components/ads/BannerSlot';
import { CourseEditorSheet } from '../components/courses/CourseEditorSheet';
import { UNSORTED_COURSE_ID } from '../components/courses/CourseList';
import { QuickSetupSheet } from '../components/courses/QuickSetupSheet';
import { SemesterSwitcher } from '../components/courses/SemesterSwitcher';
import { DeadlineEditorSheet } from '../components/deadlines/DeadlineEditorSheet';
import { BackupReminderCard } from '../components/home/BackupReminderCard';
import { ContinueCarousel } from '../components/home/ContinueCarousel';
import { CourseGrid } from '../components/home/CourseGrid';
import { DueSoon } from '../components/home/DueSoon';
import { HomeHeader } from '../components/home/HomeHeader';
import { HOME_GUTTER } from '../components/home/layout';
import { ProPassCard } from '../components/home/ProPassCard';
import { QuickActions } from '../components/home/QuickActions';
import { RecentFiles } from '../components/home/RecentFiles';
import { SectionHeader } from '../components/home/SectionHeader';
import { useOpenDocument } from '../components/library/useDocumentListActions';
import { EmptyState } from '../components/shared/EmptyState';
import { Card, Chip, ListItem } from '../components/ui';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { useScreenRole } from '../navigation/screenRole';
import {
  continueDocuments,
  courseActivity,
  currentSemester,
  homeCourses,
  homeSemester,
  recentFiles,
} from '../services/courses/homeSelectors';
import { dueSoon } from '../services/submit/deadlines';
import { useAppDispatch, useAppSelector, useAppSlices } from '../store/AppStateContext';
import { ICONS, spacing, useTheme } from '../theme';
import type { Course } from '../types/models';
import { useRenderCount } from '../utils/renderCounts';
import { useDayClock } from '../utils/useDayClock';

// §17 U6: Home answers "what do I do now?" - scan, continue, find, what's due. Top to bottom: the
// greeting with the semester chip and a search bar (HomeHeader), "Scan as" (QuickActions),
// Continue (3), the course cards, Due soon (only when something is), the banner, Recent files and
// the Pro pass. Scan itself is the tab bar's centre button (U5). All derived data comes from
// homeSelectors.ts; each section is in components/home.
export function HomeScreen() {
  useRenderCount('Home');
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const { width } = useWindowDimensions();
  const state = useAppSlices('library');
  const recentOpened = useAppSelector((s) => s.settings.recentOpened);
  const homeSemesterId = useAppSelector((s) => s.libraryUi.homeSemesterId);
  const { files, courses, semesters, deadlines } = state.library;
  const openDocument = useOpenDocument();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [quickSetup, setQuickSetup] = useState(false);
  const [editing, setEditing] = useState<{ course?: Course } | null>(null);
  const [addingDeadline, setAddingDeadline] = useState(false);

  // §16 G5: a clock that changes at midnight and when Home is shown again, not on every render,
  // so the memos below hold.
  const { now, today } = useDayClock(useScreenRole() === 'active');
  const current = useMemo(() => currentSemester(semesters, today), [semesters, today]);
  const shown = useMemo(() => homeSemester(semesters, homeSemesterId, today), [semesters, homeSemesterId, today]);
  const gridCourses = useMemo(() => homeCourses(courses, shown), [courses, shown]);
  const activity = useMemo(() => courseActivity(files), [files]);
  const resume = useMemo(() => continueDocuments(files, recentOpened), [files, recentOpened]);
  const recent = useMemo(() => recentFiles(files), [files]);
  const hasActiveCourse = courses.some((c) => !c.archived);
  // §4 S8: the next 7 days' deadlines, overdue first.
  const soon = useMemo(() => dueSoon(deadlines, now), [deadlines, now]);

  const openCourse = (id: string) => {
    dispatch({ type: 'libraryUi/SET_ACTIVE_COURSE', id });
    go('course');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <HomeHeader shown={shown} now={now} onOpenSemesters={() => setSwitcherOpen(true)} />
        <BackupReminderCard />
        <QuickActions />
        <ContinueCarousel items={resume} courses={courses} onOpen={openDocument} />

        {!hasActiveCourse ? (
          <Card>
            <EmptyState
              variant="inline"
              title={t('home.emptyTitle')}
              body={t('home.emptyBody')}
              action={{ label: t('home.emptyButton'), onPress: () => setQuickSetup(true) }}
            />
          </Card>
        ) : (
          <View style={styles.section}>
            <SectionHeader
              title={shown ? t('home.courses') : t('home.yourCourses')}
              // Nothing due: the way to add a deadline sits here instead of a Due soon section.
              trailing={
                soon.length === 0 ? (
                  <Chip label={t('home.addDeadlineChip')} icon={ICONS.deadline} onPress={() => setAddingDeadline(true)} testID="home-add-deadline" />
                ) : undefined
              }
            />
            <CourseGrid
              courses={gridCourses}
              allCourses={courses}
              activity={activity.byCourse}
              now={now}
              onOpen={openCourse}
              onEdit={(course) => setEditing({ course })}
              onAdd={() => setEditing({})}
            />
            {activity.unsorted.count > 0 ? (
              <Card padded={false}>
                <ListItem
                  title={t('home.unsortedCount', { count: activity.unsorted.count })}
                  leading={<Ionicons name="file-tray-outline" size={20} color={tokens.muted} />}
                  trailing={'chevron'}
                  onPress={() => openCourse(UNSORTED_COURSE_ID)}
                />
              </Card>
            ) : null}
          </View>
        )}

        <DueSoon
          deadlines={soon}
          courses={courses}
          now={now}
          onAdd={() => setAddingDeadline(true)}
          onOpen={(d) => {
            dispatch({ type: 'libraryUi/SET_HIGHLIGHT_DEADLINE', id: d.id });
            openCourse(d.courseId);
          }}
        />

        {/* §10 M5, §17 U6: Home's only ad, inside the scroll (an inline banner), never on the tab
            bar; nothing when ads are off. */}
        <BannerSlot screen="home" inline={{ width: Math.round(width - 2 * HOME_GUTTER) }} />

        <RecentFiles files={recent} courses={courses} now={now} onOpen={openDocument} onSeeAll={() => go('library')} />
        <ProPassCard />
      </ScrollView>

      <DeadlineEditorSheet visible={addingDeadline} onClose={() => setAddingDeadline(false)} />
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
  content: {
    paddingHorizontal: HOME_GUTTER,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
});
