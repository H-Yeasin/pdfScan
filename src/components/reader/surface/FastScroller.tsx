import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useT } from '../../../i18n/useT';
import { FAST_SCROLL_EDGE, FAST_SCROLL_THUMB, progressAtThumb, scrollProgress, thumbTop, thumbTrack, viewAtProgress } from '../../../services/reader/fastScroll';
import type { ContentInsets, Size, SurfaceLayout } from '../../../services/reader/surfaceGeometry';
import { CHROME_MAX_FONT_SCALE, radii, spacing, useTheme } from '../../../theme';
import type { SurfaceMotion } from './useSurfaceView';

type FastScrollerProps = {
  layout: SurfaceLayout;
  viewport: Size;
  insets: ContentInsets;
  motion: SurfaceMotion;
  // Shown while the pages move, and a moment after.
  visible: boolean;
  // "12 / 300", the page the view is on: the bubble's text while the thumb is held.
  label: string;
  // 1-based, for a screen reader's value.
  page: number;
  pageCount: number;
  // A screen reader's "increase" / "decrease": a page on or back.
  onStep: (by: 1 | -1) => void;
  // The thumb was taken or let go: it stays while it is held.
  onHold: (held: boolean) => void;
};

// §18 W10 (A11): the thumb on the right edge of a long document. It rides down the visible band
// as the document scrolls; dragging it scrolls the document the same way back, with the page
// number beside it. The geometry is services/reader/fastScroll.
export function FastScroller({ layout, viewport, insets, motion, visible, label, page, pageCount, onStep, onHold }: FastScrollerProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const { scale, tx, ty, moving, settled } = motion;
  const [held, setHeld] = useState(false);
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(visible ? 1 : 0, { duration: visible ? 80 : 240 });
  }, [visible, shown]);
  // Where the thumb's top was when the finger took it.
  const grabbed = useSharedValue(0);
  const dragging = useSharedValue(false);

  const drag = useMemo(() => {
    const hold = (on: boolean) => {
      setHeld(on);
      onHold(on);
    };
    return Gesture.Pan()
      .onStart(() => {
        cancelAnimation(tx);
        cancelAnimation(ty);
        moving.value = true;
        dragging.value = true;
        const track = thumbTrack(viewport, insets);
        grabbed.value = thumbTop(scrollProgress(layout, { scale: scale.value, tx: tx.value, ty: ty.value }, viewport, insets), track);
        runOnJS(hold)(true);
      })
      .onChange((e) => {
        const progress = progressAtThumb(grabbed.value + e.translationY, thumbTrack(viewport, insets));
        ty.value = viewAtProgress(layout, { scale: scale.value, tx: tx.value, ty: ty.value }, progress, viewport, insets).ty;
      })
      .onFinalize(() => {
        if (!dragging.value) return;
        dragging.value = false;
        runOnJS(hold)(false);
        settled();
      });
  }, [layout, viewport, insets, scale, tx, ty, moving, settled, grabbed, dragging, onHold]);

  const style = useAnimatedStyle(() => {
    const top = thumbTop(scrollProgress(layout, { scale: scale.value, tx: tx.value, ty: ty.value }, viewport, insets), thumbTrack(viewport, insets));
    return { transform: [{ translateY: top }] };
  });
  // The fade is the grip's, not the thumb's: on Android (RN 0.86, seen on an API 36 emulator) an
  // opacity of 0 on the view that carries the gesture and the adjustable role left the whole
  // window undrawn.
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));

  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        // Hidden, it must not take a scroll that starts under it.
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.thumb, { right: insets.right + FAST_SCROLL_EDGE }, style]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('reader.fastScroll')}
        accessibilityValue={{ min: 1, max: pageCount, now: page }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        {held ? (
          <View style={[styles.bubble, { backgroundColor: tokens.ink, borderColor: tokens.muted }]}>
            <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.bubbleText, { color: tokens.bg }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ) : null}
        <Animated.View style={[styles.grip, { backgroundColor: tokens.accent, borderColor: tokens.surface }, fade]} />
      </Animated.View>
    </GestureDetector>
  );
}

const GRIP_WIDTH = 8;
const BUBBLE_WIDTH = 132;

const styles = StyleSheet.create({
  // A 48 dp target around a slim grip.
  thumb: {
    position: 'absolute',
    top: 0,
    width: FAST_SCROLL_THUMB,
    height: FAST_SCROLL_THUMB,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  grip: {
    width: GRIP_WIDTH,
    height: FAST_SCROLL_THUMB,
    borderRadius: GRIP_WIDTH / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubble: {
    position: 'absolute',
    right: FAST_SCROLL_THUMB + spacing.sm,
    // A fixed width: an absolute child that hangs out of its 48 dp parent would be squeezed to
    // nothing. Wide enough for "1234 / 1234". The line keeps it apart from a night page.
    width: BUBBLE_WIDTH,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.chip * 2,
  },
  bubbleText: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
