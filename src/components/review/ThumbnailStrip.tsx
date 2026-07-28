import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radii, spacing, useTheme } from '../../theme';
import type { SessionPage } from '../../types/models';

const THUMB_WIDTH = 60;
const THUMB_HEIGHT = (THUMB_WIDTH * 4) / 3;
const GAP = spacing.sm;
const SLOT = THUMB_WIDTH + GAP;

type ThumbnailStripProps = {
  pages: SessionPage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAddMore: () => void;
};

export function ThumbnailStrip({ pages, selectedIndex, onSelect, onReorder, onAddMore }: ThumbnailStripProps) {
  const { tokens } = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {pages.map((page, index) => (
        <DraggableThumbnail
          key={page.id}
          page={page}
          index={index}
          total={pages.length}
          selected={index === selectedIndex}
          onSelect={onSelect}
          onDropAt={onReorder}
        />
      ))}
      <Pressable
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
};

function DraggableThumbnail({ page, index, total, selected, onSelect, onDropAt }: DraggableThumbnailProps) {
  const { tokens } = useTheme();
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
        style={[
          styles.thumb,
          { backgroundColor: tokens.surface, borderColor: selected ? tokens.accent : 'transparent' },
          animatedStyle,
        ]}
      >
        <Image source={{ uri: page.uri }} style={styles.thumbImage} resizeMode="cover" />
        <View style={styles.indexBadge}>
          <Text style={styles.indexBadgeText}>{index + 1}</Text>
        </View>
        {page.err ? <View style={[styles.errDot, { backgroundColor: tokens.danger }]} /> : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
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
});
