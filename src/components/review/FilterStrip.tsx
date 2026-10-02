import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Skia } from '@shopify/react-native-skia';
import type { SkImage, SkPicture } from '@shopify/react-native-skia';
import { FilteredPreview } from './FilteredPreview';
import { drawFiltered } from '../../services/enhance/filters/drawFiltered';
import { FILTERS } from '../../services/enhance/filters/registry';
import { analyzeImage } from '../../services/enhance/filters/stats';
import { loadThumbImage, THUMB_MAX_DIM } from '../../services/enhance/previewImageCache';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import type { EnhanceMode, SessionPage } from '../../types/models';

const THUMB_WIDTH = 58;
const THUMB_HEIGHT = 76;

const STRIP_FILTERS = FILTERS.filter((spec) => spec.available);

type FilterStripProps = {
  page: SessionPage;
  value: EnhanceMode;
  onChange: (value: EnhanceMode) => void;
};

// The filter picker: one live thumbnail per filter, each the current page drawn through that filter
// by drawFiltered (the export's own code path) from a small decode, so the user picks by looking.
// Sliders aren't applied to the thumbnails - they compare filters, not adjustments.
export function FilterStrip({ page, value, onChange }: FilterStripProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [loaded, setLoaded] = useState<{ uri: string; image: SkImage } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadThumbImage(page.uri, THUMB_MAX_DIM)
      .then((image) => {
        if (!cancelled) setLoaded({ uri: page.uri, image });
      })
      .catch((error) => console.warn('FilterStrip: failed to decode thumbnail', error));
    return () => {
      cancelled = true;
    };
  }, [page.uri]);

  const image = loaded?.uri === page.uri ? loaded.image : null;
  const { stats, filterOptions } = page;
  const pictures = useMemo(() => {
    if (!image) return null;
    const rect = Skia.XYWHRect(0, 0, image.width(), image.height());
    // Measured once for all seven when the page has none yet, instead of once per drawFiltered.
    const thumbStats = stats ?? analyzeImage(image);
    const out = new Map<EnhanceMode, SkPicture>();
    for (const spec of STRIP_FILTERS) {
      const recorder = Skia.PictureRecorder();
      drawFiltered(recorder.beginRecording(rect), image, { enhance: spec.id, stats: thumbStats, filterOptions }, rect);
      out.set(spec.id, recorder.finishRecordingAsPicture());
    }
    return out;
  }, [image, stats, filterOptions]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {STRIP_FILTERS.map((spec) => {
        const active = spec.id === value;
        const picture = pictures?.get(spec.id);
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            key={spec.id}
            style={styles.item}
            onPress={() => onChange(spec.id)}
            hitSlop={4}
          >
            <View
              style={[
                styles.thumb,
                { borderColor: active ? tokens.accent : tokens.edge, backgroundColor: tokens.surface2 },
                active && styles.thumbActive,
              ]}
            >
              {picture && image && (
                <FilteredPreview picture={picture} contentWidth={image.width()} contentHeight={image.height()} />
              )}
            </View>
            <Text
              style={[styles.label, { color: active ? tokens.accent : tokens.muted }, active && styles.labelActive]}
              numberOfLines={1}
            >
              {t(spec.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  item: {
    alignItems: 'center',
    gap: 4,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radii.card / 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbActive: {
    borderWidth: 2.5,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '700',
  },
});
