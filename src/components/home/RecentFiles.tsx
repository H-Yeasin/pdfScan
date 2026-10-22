import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { relativeDay } from '../../services/courses/homeSelectors';
import { spacing } from '../../theme';
import type { Course, LibraryDocument } from '../../types/models';
import { Button, Card, ListItem } from '../ui';
import { DocThumb } from './DocThumb';
import { SectionHeader } from './SectionHeader';

type RecentFilesProps = {
  // recentFiles(): the newest five.
  files: readonly LibraryDocument[];
  courses: readonly Course[];
  now: number;
  onOpen: (doc: LibraryDocument) => void;
  onSeeAll: () => void;
};

// §17 U6: the five newest documents, "See all" → Files. Nothing for an empty library.
export function RecentFiles({ files, courses, now, onOpen, onSeeAll }: RecentFilesProps) {
  const { t } = useT();
  if (files.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('home.recentFiles')}
        trailing={<Button variant="ghost" size="sm" label={t('home.seeAll')} accessibilityLabel={t('home.seeAllA11y')} onPress={onSeeAll} />}
      />
      <Card padded={false}>
        {files.map((doc) => {
          const course = doc.courseId ? courses.find((c) => c.id === doc.courseId) : undefined;
          return (
            <ListItem
              key={doc.id}
              title={doc.name}
              subtitle={`${course?.name ?? t('common.unsorted')} · ${relativeDay(doc.createdAt, now)}`}
              leading={<DocThumb doc={doc} width={36} height={46} />}
              trailing={'chevron'}
              onPress={() => onOpen(doc)}
              testID={`home-recent-${doc.id}`}
            />
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
});
