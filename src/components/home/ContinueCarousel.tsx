import { ScrollView, StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { continueProgress, type ContinueItem } from '../../services/courses/homeSelectors';
import { spacing } from '../../theme';
import type { Course, LibraryDocument } from '../../types/models';
import { Card, Text } from '../ui';
import { DocThumb } from './DocThumb';
import { HOME_GUTTER } from './layout';
import { SectionHeader } from './SectionHeader';

type ContinueCarouselProps = {
  items: readonly ContinueItem[];
  courses: readonly Course[];
  onOpen: (doc: LibraryDocument) => void;
};

const CARD_WIDTH = 248;

// §17 U6: the last documents opened (and a scan just saved), up to three, as cards on their
// course's tint: thumbnail, title, course and where reading stopped. Nothing for an empty library.
export function ContinueCarousel({ items, courses, onOpen }: ContinueCarouselProps) {
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <View>
      <SectionHeader title={t('home.continue')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}>
        {items.map(({ doc, reason }) => {
          const course = doc.courseId ? courses.find((c) => c.id === doc.courseId) : undefined;
          const progress = continueProgress(doc);
          const where = progress
            ? t('home.pageOf', { page: progress.page, count: progress.count })
            : doc.pages.length > 0
              ? t('home.pages', { count: doc.pages.length })
              : doc.format;
          const label = reason === 'opened' ? t('home.continueReading') : t('home.latestScan');
          const courseName = course?.name ?? t('common.unsorted');
          return (
            <Card
              key={doc.id}
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
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bleed: {
    marginHorizontal: -HOME_GUTTER,
  },
  row: {
    paddingHorizontal: HOME_GUTTER,
    // Room for the cards' shadow.
    paddingBottom: spacing.xs,
    gap: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
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
