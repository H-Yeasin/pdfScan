import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { moveCourse, relativeDay, type CourseActivity } from '../../services/courses/homeSelectors';
import { courseColorValue } from '../../services/courses/palette';
import { nextClass, nextClassLabel } from '../../services/courses/timetable';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import { ICON_SIZE, ICONS, radii, spacing, useTheme } from '../../theme';
import type { Course } from '../../types/models';
import { CourseBadge } from '../courses/CourseBadge';
import { Card, IconButton, Menu, Text, Touchable, type MenuSection } from '../ui';

type CourseGridProps = {
  // The courses Home shows, in their order (homeCourses).
  courses: readonly Course[];
  // Every course, for reordering among them (moveCourse).
  allCourses: readonly Course[];
  activity: ReadonlyMap<string, CourseActivity>;
  now: number;
  onOpen: (id: string) => void;
  onEdit: (course: Course) => void;
  onAdd: () => void;
};

type CourseMenuId = 'edit' | 'earlier' | 'later' | 'archive';

export function courseMenuSections(t: ReturnType<typeof useT>['t'], index: number, count: number): MenuSection<CourseMenuId>[] {
  return [
    {
      items: [
        { id: 'edit', label: t('common.edit'), icon: ICONS.editCourse },
        ...(index > 0 ? [{ id: 'earlier' as const, label: t('home.moveEarlier'), icon: 'arrow-back-outline' as const }] : []),
        ...(index < count - 1 ? [{ id: 'later' as const, label: t('home.moveLater'), icon: 'arrow-forward-outline' as const }] : []),
        { id: 'archive', label: t('home.archive'), icon: 'archive-outline' },
      ],
    },
  ];
}

// §17 U6: the semester's courses as cards on their tint: name, document count and last scan, the
// next class from the timetable, and a visible ⋯ (Edit, Move earlier/later, Archive; long-press
// opens it too). "Add course" is the last card.
export function CourseGrid({ courses, allCourses, activity, now, onOpen, onEdit, onAdd }: CourseGridProps) {
  const { t } = useT();
  const { tokens } = useTheme();
  const dispatch = useAppDispatch();
  const timetable = useAppSelector((s) => s.library.timetable);
  const [menuFor, setMenuFor] = useState<Course | null>(null);

  const shownIds = useMemo(() => courses.map((c) => c.id), [courses]);
  const menuIndex = menuFor ? shownIds.indexOf(menuFor.id) : -1;
  const sections = useMemo(() => courseMenuSections(t, menuIndex, shownIds.length), [t, menuIndex, shownIds.length]);

  const onMenu = (id: CourseMenuId) => {
    const course = menuFor;
    if (!course) return;
    if (id === 'edit') onEdit(course);
    else if (id === 'archive') {
      dispatch({ type: 'library/UPDATE_COURSE', id: course.id, patch: { archived: true } });
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('home.archived', { name: course.name }) });
    } else {
      const ids = moveCourse(allCourses, shownIds, course.id, id === 'earlier' ? -1 : 1);
      if (ids) dispatch({ type: 'library/REORDER_COURSES', ids });
    }
  };

  return (
    <View style={styles.grid}>
      {courses.map((course) => {
        const stats = activity.get(course.id);
        const next = nextClass(timetable, course.id, new Date(now));
        const fullName = [course.code, course.name].filter(Boolean).join(', ');
        const meta = stats ? `${t('home.docCount', { count: stats.count })} · ${relativeDay(stats.lastScanAt!, now)}` : t('home.noScansYet');
        return (
          <Card
            key={course.id}
            tone="tinted"
            tint={course.color}
            onPress={() => onOpen(course.id)}
            onLongPress={() => setMenuFor(course)}
            accessibilityLabel={
              stats
                ? t('a11y.courseCard', { name: fullName, documents: t('a11y.documents', { count: stats.count }), when: relativeDay(stats.lastScanAt!, now) })
                : t('a11y.courseCardEmpty', { name: fullName })
            }
            accessibilityHint={t('home.courseHint')}
            style={styles.card}
            testID={`home-course-${course.id}`}
          >
            <View style={styles.top}>
              <CourseBadge course={course} size={36} />
              <IconButton
                icon={ICONS.more}
                size="sm"
                accessibilityLabel={t('home.courseMore', { name: course.name })}
                onPress={() => setMenuFor(course)}
                testID={`home-course-more-${course.id}`}
              />
            </View>
            {course.code ? (
              <Text variant="label" color={courseColorValue(course.color, tokens)} numberOfLines={1}>
                {course.code}
              </Text>
            ) : null}
            <Text variant="bodyStrong" numberOfLines={2}>
              {course.name}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {meta}
            </Text>
            {next ? (
              <View style={styles.next}>
                <Ionicons name={ICONS.timetable} size={ICON_SIZE.inline} color={next.now ? tokens.accentInk : tokens.muted} />
                <Text variant="caption" color={next.now ? 'accentInk' : 'muted'} numberOfLines={1}>
                  {nextClassLabel(next)}
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}
      <Touchable
        accessibilityRole="button"
        scale={false}
        onPress={onAdd}
        style={[styles.card, styles.add, { borderColor: tokens.edge }]}
        testID="home-add-course"
      >
        <Ionicons name="add" size={24} color={tokens.accentInk} />
        <Text variant="label" color="accentInk">
          {t('home.addCourse')}
        </Text>
      </Touchable>

      <Menu visible={menuFor !== null} onClose={() => setMenuFor(null)} onSelect={onMenu} sections={sections} title={menuFor?.name} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 148,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
