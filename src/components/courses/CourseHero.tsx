import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useT } from '../../i18n/useT';
import { ICONS, radii, spacing } from '../../theme';
import type { Course } from '../../types/models';
import { Button, Card, Chip, Text } from '../ui';
import { CourseBadge } from './CourseBadge';

type CourseHeroProps = {
  course?: Course;
  title: string;
  subtitle?: string;
  // The course's tint (Unsorted: the second surface); the top bar above it has the same.
  background: string;
  packCount: number;
  showPack: boolean;
  // Unsorted, with something to sort and a course to sort it into.
  canSort: boolean;
  // The one-time "Sort them now?" card (Unsorted).
  sortPromptCount: number | null;
  onScan: () => void;
  onPack: () => void;
  onSort: () => void;
  onEdit?: () => void;
  onDismissSortPrompt: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
};

// §17 U11: the top of a course's page, on the course's tint: its mark, the name as a large title,
// code · teacher, then labelled action chips (Scan first, filled), so no action hides behind an
// unlabelled icon. It scrolls with the list; the bar above takes the name once it is gone.
export function CourseHero({
  course,
  title,
  subtitle,
  background,
  packCount,
  showPack,
  canSort,
  sortPromptCount,
  onScan,
  onPack,
  onSort,
  onEdit,
  onDismissSortPrompt,
  onLayout,
}: CourseHeroProps) {
  const { t } = useT();
  return (
    <View style={[styles.hero, { backgroundColor: background }]} onLayout={onLayout}>
      <View style={styles.titleRow}>
        {course ? <CourseBadge course={course} size={48} /> : null}
        <View style={styles.titles}>
          <Text variant="headline" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          size="sm"
          icon={ICONS.scan}
          label={t('common.scan')}
          accessibilityLabel={course ? t('courses.page.scanIntoA11y', { name: course.name }) : undefined}
          onPress={onScan}
          testID="course-scan"
        />
        {showPack ? (
          <Chip
            icon={ICONS.examPack}
            label={t('courses.page.examPack')}
            count={packCount || undefined}
            accessibilityLabel={packCount ? t('courses.page.examPackCountA11y', { count: packCount }) : undefined}
            onPress={onPack}
            testID="course-pack"
          />
        ) : null}
        {canSort ? <Chip icon={ICONS.move} label={t('courses.page.sortUnsorted')} onPress={onSort} testID="course-sort-unsorted" /> : null}
        {onEdit ? <Chip icon={ICONS.editCourse} label={t('courses.edit')} accessibilityLabel={t('courses.editCourse')} onPress={onEdit} testID="course-edit" /> : null}
      </View>
      {sortPromptCount ? (
        <Card style={styles.prompt}>
          <Text variant="bodyStrong">{t('courses.page.sortBanner', { count: sortPromptCount })}</Text>
          <View style={styles.promptActions}>
            <Button size="sm" variant="ghost" label={t('courses.page.notNow')} onPress={onDismissSortPrompt} />
            <Button size="sm" variant="tonal" label={t('courses.page.sortNow')} onPress={onSort} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    borderBottomLeftRadius: radii.sheet,
    borderBottomRightRadius: radii.sheet,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  prompt: {
    gap: spacing.sm,
  },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
