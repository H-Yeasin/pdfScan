import { ScrollView, StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { radii, spacing, useTheme } from '../../theme';
import type { SessionPage } from '../../types/models';
import { rotationStyle } from '../../utils/rotation';
import { AppImage } from '../shared/AppImage';
import { Text, Touchable } from '../ui';

// §17 U9: the Save screen's look at what is being saved. A tap goes back to that page in Review.
// The pages as they are (turned, not filtered): the filters are drawn by Skia in Review only.

const THUMB_W = 64;
const THUMB_H = 88;

type PagePreviewStripProps = {
  pages: readonly SessionPage[];
  onPressPage: (index: number) => void;
};

export function PagePreviewStrip({ pages, onPressPage }: PagePreviewStripProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="save-pages">
      {pages.map((page, index) => (
        <Touchable
          key={page.id}
          accessibilityRole="button"
          accessibilityLabel={t('deliver.pageA11y', { page: index + 1 })}
          onPress={() => onPressPage(index)}
          style={[styles.thumb, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
        >
          <AppImage uri={page.thumbUri ?? page.uri} bare style={[styles.image, rotationStyle(page.rotation)]} contentFit="contain" />
          <View style={[styles.number, { backgroundColor: tokens.surface }]}>
            <Text variant="caption" weight="semibold" chrome>
              {index + 1}
            </Text>
          </View>
        </Touchable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: radii.thumb,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: THUMB_W,
    height: THUMB_H,
  },
  number: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    minWidth: 22,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.full,
    alignItems: 'center',
  },
});
