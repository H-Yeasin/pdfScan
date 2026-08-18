import { useLayoutEffect, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useZoomableImageGesture } from '../shared/useZoomableImageGesture';
import type { SessionPage } from '../../types/models';

const SWIPE_DISTANCE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 300;
const SETTLE_DURATION = 220;
const RUBBER_BAND_FACTOR = 0.35;
// How much of the neighboring page peeks in from each edge at rest, Instagram-carousel style,
// and the breathing room between panels so the peek reads as a separate card, not a cut-off crop.
const PEEK_WIDTH = 28;
const PANEL_GAP = 10;

type PagePeekCarouselProps = {
  pages: SessionPage[];
  sel: number;
  displayUri: string | undefined;
  onCommitPrev: () => void;
  onCommitNext: () => void;
};

// Drives an interactive, drag-following page transition (like the Photos app): the current page's
// image slides with the finger while a raw peek of the neighboring page slides in from that edge.
// Even at rest, the prev/next panels are sized to leave a PEEK_WIDTH sliver visible at each edge,
// hinting that the page is swipeable before the user touches it.
// Only the "current" panel gets the expensive enhanced/stamped `displayUri` - the peek panels use
// the page's raw (already-captured) uri, same cheap source ThumbnailStrip renders for thumbnails.
export function PagePeekCarousel({ pages, sel, displayUri, onCommitPrev, onCommitNext }: PagePeekCarouselProps) {
  const [width, setWidth] = useState(0);
  const dragX = useSharedValue(0);
  const isAnimating = useSharedValue(false);
  const widthShared = useSharedValue(0);

  const currentIndex = pages[sel] ? sel : 0;
  const currentPage = pages[currentIndex];
  const prevPage = currentIndex > 0 ? pages[currentIndex - 1] : undefined;
  const nextPage = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : undefined;
  const hasPrev = !!prevPage;
  const hasNext = !!nextPage;

  const { gesture: zoomGesture, animatedStyle: zoomStyle, scale } = useZoomableImageGesture({ panEnabled: true });

  // Panel width leaves PEEK_WIDTH visible from each neighbor at rest.
  const mainWidth = width > 0 ? Math.max(width - PEEK_WIDTH * 2 - PANEL_GAP * 2, 1) : 0;
  const baseLeft = PEEK_WIDTH - mainWidth;

  const pagingPan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      if (scale.value > 1 || isAnimating.value) return;
      const w = widthShared.value || 1;
      const raw = e.translationX;
      const blocked = (raw < 0 && !hasNext) || (raw > 0 && !hasPrev);
      dragX.value = blocked ? Math.sign(raw) * w * RUBBER_BAND_FACTOR * (1 - 1 / (1 + Math.abs(raw) / w)) : raw;
    })
    .onEnd((e) => {
      if (scale.value > 1 || isAnimating.value) return;
      const w = widthShared.value || 1;
      const pitch = Math.max(w - PEEK_WIDTH * 2 - PANEL_GAP * 2, 1) + PANEL_GAP;
      const wantsNext = e.translationX <= -SWIPE_DISTANCE_THRESHOLD || e.velocityX <= -SWIPE_VELOCITY_THRESHOLD;
      const wantsPrev = e.translationX >= SWIPE_DISTANCE_THRESHOLD || e.velocityX >= SWIPE_VELOCITY_THRESHOLD;
      if (wantsNext && hasNext) {
        isAnimating.value = true;
        dragX.value = withTiming(-pitch, { duration: SETTLE_DURATION }, (finished) => {
          if (finished) runOnJS(onCommitNext)();
          else isAnimating.value = false;
        });
      } else if (wantsPrev && hasPrev) {
        isAnimating.value = true;
        dragX.value = withTiming(pitch, { duration: SETTLE_DURATION }, (finished) => {
          if (finished) runOnJS(onCommitPrev)();
          else isAnimating.value = false;
        });
      } else {
        dragX.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const gesture = Gesture.Simultaneous(pagingPan, zoomGesture);

  // Once the parent has actually committed the new page (new `currentPage.id` landed via props),
  // snap the drag offset back to 0 with no animation - the pixels at the settled offset and the
  // freshly re-centered offset are the same raw peek image, so this reset is an invisible no-op.
  useLayoutEffect(() => {
    dragX.value = 0;
    isAnimating.value = false;
  }, [currentPage?.id, dragX, isAnimating]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthShared.value = w;
  };

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }));

  if (!currentPage) return <View style={styles.fill} onLayout={handleLayout} />;

  return (
    <View style={styles.fill} onLayout={handleLayout}>
      {width > 0 && (
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[styles.track, { width: mainWidth * 3 + PANEL_GAP * 2, left: baseLeft }, trackStyle]}
          >
            <View style={[styles.panel, { width: mainWidth, marginRight: PANEL_GAP }]}>
              {prevPage && <Image source={{ uri: prevPage.uri }} style={styles.image} resizeMode="contain" />}
            </View>
            <View style={[styles.panel, { width: mainWidth, marginRight: PANEL_GAP }]}>
              <Animated.Image
                source={{ uri: displayUri ?? currentPage.uri }}
                style={[styles.image, zoomStyle]}
                resizeMode="contain"
              />
            </View>
            <View style={[styles.panel, { width: mainWidth }]}>
              {nextPage && <Image source={{ uri: nextPage.uri }} style={styles.image} resizeMode="contain" />}
            </View>
          </Animated.View>
        </GestureDetector>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  track: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  panel: {
    height: '100%',
    borderRadius: 10,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
