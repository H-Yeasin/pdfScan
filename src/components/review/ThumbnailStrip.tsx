import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import type { SessionPage } from '../../types/models';
import { rotationStyle } from '../../utils/rotation';
import { useStableCallback } from '../../utils/useStableCallback';
import { AppImage } from '../shared/AppImage';

const THUMB_WIDTH = 60;
const THUMB_HEIGHT = (THUMB_WIDTH * 4) / 3;
const GAP = spacing.sm;
const SLOT = THUMB_WIDTH + GAP;

type CoverSlot = { mode: 'template' | 'imported_image'; importedUri?: string } | null;

type ThumbnailStripProps = {
  pages: SessionPage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAddMore: () => void;
  onDelete: (id: string) => void;
  // Leads the strip (page 0 in the final document) so the strip's visual order matches the
  // exported PDF's actual page order. Tapping it always jumps straight to Academic Options to
  // add/edit the cover - same "tap to configure" behavior as the "+" add-page tile jumping to
  // Capture, not a selectable preview target.
  cover: CoverSlot;
  onPressCover: () => void;
};

export function ThumbnailStrip({
  pages,
  selectedIndex,
  onSelect,
  onReorder,
  onAddMore,
  onDelete,
  cover,
  onPressCover,
}: ThumbnailStripProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  // §9 O5: stable handlers, so a progress tick or a filter change on one page re-renders only the
  // thumbnails whose page or position changed.
  const select = useStableCallback(onSelect);
  const reorder = useStableCallback(onReorder);
  const remove = useStableCallback(onDelete);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.content}
    >
      <Pressable accessibilityRole="button"
        onPress={onPressCover}
        style={[
          styles.thumb,
          styles.coverTile,
          { backgroundColor: tokens.surface, borderColor: cover ? tokens.accent : tokens.edge },
          !cover && styles.coverTileEmpty,
        ]}
      >
        {cover?.mode === 'imported_image' && cover.importedUri ? (
          <AppImage uri={cover.importedUri} style={styles.thumbImage} />
        ) : (
          <Ionicons
            name={cover ? 'document-text-outline' : 'add-outline'}
            size={22}
            color={cover ? tokens.accent : tokens.muted}
          />
        )}
        <View style={styles.coverLabel}>
          <Text style={styles.coverLabelText}>{t('review.cover')}</Text>
        </View>
      </Pressable>

      {pages.map((page, index) => (
        <DraggableThumbnail
          key={page.id}
          page={page}
          index={index}
          total={pages.length}
          selected={index === selectedIndex}
          onSelect={select}
          onDropAt={reorder}
          onDelete={remove}
        />
      ))}
      <Pressable accessibilityRole="button"
        onPress={onAddMore}
        style={[styles.addTile, { borderColor: tokens.edge }]}
      >
        <Text style={[styles.addLabel, { color: tokens.muted }]}>+</Text>
      </Pressable>
    </ScrollView>
  );
}

type DraggableThumbnailProps = {
  page: SessionPage;
  index: number;
  total: number;
  selected: boolean;
  onSelect: (index: number) => void;
  onDropAt: (fromIndex: number, toIndex: number) => void;
  onDelete: (id: string) => void;
};

const DraggableThumbnail = memo(function DraggableThumbnail({
  page,
  index,
  total,
  selected,
  onSelect,
  onDropAt,
  onDelete,
}: DraggableThumbnailProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const translateX = useSharedValue(0);
  const dragging = useSharedValue(0);

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onSelect)(index);
  });

  const pan = Gesture.Pan()
    .minDistance(10)
    .onStart(() => {
      dragging.value = withTiming(1, { duration: 100 });
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const rawTarget = index + Math.round(e.translationX / SLOT);
      const target = Math.max(0, Math.min(total - 1, rawTarget));
      translateX.value = withTiming(0);
      dragging.value = withTiming(0, { duration: 100 });
      if (target !== index) runOnJS(onDropAt)(index, target);
    });

  const gesture = Gesture.Race(tap, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: 1 + dragging.value * 0.06 }],
    zIndex: dragging.value > 0 ? 10 : 0,
    elevation: dragging.value > 0 ? 6 : 0,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        // §9 O4: one element for screen readers. Drag-to-reorder and the delete badge have
        // actions instead ("Move earlier", "Move later", "Remove page").
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('a11y.pageOf', { n: index + 1, total })}
        accessibilityState={{ selected }}
        accessibilityActions={[
          { name: 'activate' },
          ...(index > 0 ? [{ name: 'moveEarlier', label: t('a11y.moveEarlier') }] : []),
          ...(index < total - 1 ? [{ name: 'moveLater', label: t('a11y.moveLater') }] : []),
          { name: 'remove', label: t('a11y.removePage', { n: index + 1 }) },
        ]}
        onAccessibilityAction={(e) => {
          const action = e.nativeEvent.actionName;
          if (action === 'activate') onSelect(index);
          else if (action === 'remove') onDelete(page.id);
          else if (action === 'moveEarlier' || action === 'moveLater') {
            const to = index + (action === 'moveEarlier' ? -1 : 1);
            onDropAt(index, to);
            AccessibilityInfo.announceForAccessibility(t('a11y.moved', { n: to + 1 }));
          }
        }}
        style={[
          styles.thumb,
          { backgroundColor: tokens.surface, borderColor: selected ? tokens.accent : 'transparent' },
          animatedStyle,
        ]}
      >
        {/* §16 G6: a session page's thumbnail is made at ingest; until a crop or a merge has
            written the new one it's the page itself, which expo-image decodes at this size. */}
        <AppImage uri={page.thumbUri ?? page.uri} bare style={[styles.thumbImage, rotationStyle(page.rotation)]} />
        <View style={styles.indexBadge}>
          <Text style={styles.indexBadgeText}>{index + 1}</Text>
        </View>
        {page.err ? <View style={[styles.errDot, { backgroundColor: tokens.danger }]} /> : null}
        <Pressable
          hitSlop={8}
          style={[styles.deleteBadge, { backgroundColor: tokens.danger }]}
          onPress={() => onDelete(page.id)}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.removePage', { n: index + 1 })}
        >
          <Ionicons name="close" size={11} color="#fff" />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  // Without an explicit height, a horizontal ScrollView with no `style` can end up stretching to
  // fill the flex column's remaining space (its cross-axis sizing default), leaving a tall empty
  // scrollable area below the actual thumbnail row. Bounding it to exactly the content's own
  // height keeps the strip pinned to just its tiles.
  scrollView: {
    height: THUMB_HEIGHT + spacing.md * 2,
    flexGrow: 0,
  },
  content: {
    flexDirection: 'row',
    gap: GAP,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radii.thumb,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  indexBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  errDot: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  deleteBadge: {
    position: 'absolute',
    right: 3,
    top: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radii.thumb,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    fontSize: 24,
  },
  coverTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  coverTileEmpty: {
    borderStyle: 'dashed',
  },
  coverLabel: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 4,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverLabelText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});
