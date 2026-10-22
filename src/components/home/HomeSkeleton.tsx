import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { radii, spacing } from '../../theme';
import { Card, Skeleton } from '../ui';

// §17 U13: the course cards' place while the library loads, shaped like CourseGrid's cards, so a
// cold start doesn't flash "Add your first course" at a student who has six.
export function HomeSkeleton({ count = 4 }: { count?: number }) {
  const { t } = useT();
  return (
    <View style={styles.section} accessible accessibilityRole="progressbar" accessibilityLabel={t('a11y.loadingDocuments')}>
      <Skeleton width="35%" height={12} />
      <View style={styles.grid}>
        {Array.from({ length: count }, (_, i) => (
          <Card key={i} style={styles.card}>
            <Skeleton width={28} height={28} radius={radii.xs} />
            <Skeleton width="80%" height={14} />
            <Skeleton width="50%" height={10} />
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { flexBasis: '47%', flexGrow: 1, gap: spacing.sm, minHeight: 148 },
});
