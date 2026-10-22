import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { UNSORTED_COURSE_ID } from '../../services/library/documentFilters';
import { ICON_SIZE, ICONS, radii, spacing, useTheme } from '../../theme';
import type { Course, LibraryDocument } from '../../types/models';
import { CourseBadge } from '../courses/CourseBadge';
import { Card, Text, Touchable } from '../ui';

type CourseFoldersProps = {
  courses: readonly Course[];
  files: readonly LibraryDocument[];
  onOpen: (courseId: string) => void;
  onManage: () => void;
};

// §17 U7: the top of Files - a folder card per course on its tint, with how many documents it
// holds, then Unsorted, then Manage (the courses screen). A tap opens the course's page, which
// has its deadlines and submissions; the list below stays every document. Archived courses are
// left out (their documents are still in the list and in the filters).
export const CourseFolders = memo(function CourseFolders({ courses, files, onOpen, onManage }: CourseFoldersProps) {
  const { t } = useT();
  const { tokens } = useTheme();

  const counts = useMemo(() => {
    const byCourse = new Map<string, number>();
    for (const doc of files) {
      if (doc.archived) continue;
      const id = doc.courseId ?? UNSORTED_COURSE_ID;
      byCourse.set(id, (byCourse.get(id) ?? 0) + 1);
    }
    return byCourse;
  }, [files]);

  const shown = useMemo(() => courses.filter((c) => !c.archived), [courses]);
  const unsorted = counts.get(UNSORTED_COURSE_ID) ?? 0;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="files-folders">
      {shown.map((course) => {
        const count = counts.get(course.id) ?? 0;
        return (
          <Card
            key={course.id}
            tone="tinted"
            tint={course.color}
            onPress={() => onOpen(course.id)}
            accessibilityLabel={t('library.folderA11y', { name: course.name, documents: t('a11y.documents', { count }) })}
            style={styles.folder}
            testID={`files-folder-${course.id}`}
          >
            <CourseBadge course={course} size={32} />
            <Text variant="label" numberOfLines={1}>
              {course.code || course.name}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {t('home.docCount', { count })}
            </Text>
          </Card>
        );
      })}
      {unsorted > 0 ? (
        <Card
          tone="tinted"
          onPress={() => onOpen(UNSORTED_COURSE_ID)}
          accessibilityLabel={t('library.folderA11y', { name: t('common.unsorted'), documents: t('a11y.documents', { count: unsorted }) })}
          style={styles.folder}
          testID="files-folder-unsorted"
        >
          <View style={[styles.unsortedMark, { borderColor: tokens.edge }]}>
            <Ionicons name="file-tray-outline" size={ICON_SIZE.row} color={tokens.muted} />
          </View>
          <Text variant="label" numberOfLines={1}>
            {t('common.unsorted')}
          </Text>
          <Text variant="caption" color="muted" numberOfLines={1}>
            {t('home.docCount', { count: unsorted })}
          </Text>
        </Card>
      ) : null}
      <Touchable accessibilityRole="button" scale={false} onPress={onManage} style={[styles.folder, styles.manage, { borderColor: tokens.edge }]} testID="files-folders-manage">
        <Ionicons name={ICONS.editCourse} size={ICON_SIZE.row} color={tokens.accentInk} />
        <Text variant="label" color="accentInk" numberOfLines={1}>
          {shown.length ? t('library.manageCourses') : t('library.addCourse')}
        </Text>
      </Touchable>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  folder: {
    width: 120,
    gap: spacing.xs,
  },
  unsortedMark: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manage: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
});
