import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { continueProgress } from '../../services/courses/homeSelectors';
import { spacing } from '../../theme';
import type { Course, LibraryDocument } from '../../types/models';
import { Card, Text } from '../ui';
import { DocThumb } from './DocThumb';

type ContinueCardProps = {
  // continueDocument(): the document last opened, or null.
  doc: LibraryDocument | null;
  courses: readonly Course[];
  onOpen: (doc: LibraryDocument) => void;
};

// §17 U6: "Continue reading", one full-width card on its course's tint: thumbnail, title, course
// and where reading stopped. It was a carousel of three docked above the tab bar, which squeezed
// the scroll on a phone and repeated Recent files; now it is one card near the top of the scroll,
// and only for a document actually opened. Nothing when none was.
export function ContinueCard({ doc, courses, onOpen }: ContinueCardProps) {
  const { t } = useT();
  if (!doc) return null;
  const course = doc.courseId ? courses.find((c) => c.id === doc.courseId) : undefined;
  const progress = continueProgress(doc);
  const where = progress
    ? t('home.pageOf', { page: progress.page, count: progress.count })
    : doc.pages.length > 0
      ? t('home.pages', { count: doc.pages.length })
      : doc.format;
  const label = t('home.continueReading');
  const courseName = course?.name ?? t('common.unsorted');
  return (
    <Card
      tone={course ? 'tinted' : 'surface'}
      tint={course?.color}
      onPress={() => onOpen(doc)}
      accessibilityLabel={[label, doc.name, courseName, where].join(', ')}
      style={styles.card}
      testID={`home-continue-${doc.id}`}
    >
      <DocThumb doc={doc} width={52} height={68} />
      <View style={styles.texts}>
        <Text variant="overline" color="muted" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="bodyStrong" numberOfLines={2}>
          {doc.name}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {courseName} · {where}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
