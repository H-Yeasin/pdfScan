import { memo, useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { spacing, useTheme } from '../../theme';

const THUMB_SIZE = 20;
const MIN = -1;
const MAX = 1;

type AdjustSliderProps = {
  label: string;
  value: number; // -1..1, 0 is the centered/no-op position
  // §16 G7: the value under the finger, written from the UI thread on every frame of a drag.
  // Whatever follows the drag (Review's preview) reads this, never a callback.
  live?: SharedValue<number>;
  // Fires on the JS thread for every frame of a drag - for the dev Filter Lab only; anything a
  // user sees should follow `live`.
  onChange?: (value: number) => void;
  // Fires once on release/tap — this is what should actually reach the store.
  onCommit: (value: number) => void;
};

// Modeled on the existing QualitySlider (same Pan+Tap-over-a-track pattern), but continuous
// rather than 5-step, and fills from the center out rather than from the left edge, since -1..1
// is a bidirectional adjustment around a neutral zero rather than a magnitude from a floor.
export function AdjustSlider({ label, value, live, onChange, onCommit }: AdjustSliderProps) {
  const { tokens } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useSharedValue(0);
  // A slider nobody listens to on the UI thread still shows its own number while it moves.
  const own = useSharedValue(value);
  const current = live ?? own;

  const toX = (v: number) => trackWidth <= 0 ? 0 : ((v - MIN) / (MAX - MIN)) * trackWidth;

  useEffect(() => {
    if (trackWidth > 0) x.value = withTiming(toX(value), { duration: 80 });
    // `live` is kept in step by its owner (useLiveAdjust).
    own.value = value;
  }, [trackWidth, value]);

  const handleLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  // A position on the track as a value, to two decimals: what is shown, drawn and committed.
  const valueAt = (px: number) => {
    'worklet';
    const clamped = Math.max(0, Math.min(trackWidth, px));
    return trackWidth <= 0 ? 0 : Math.round((MIN + (clamped / trackWidth) * (MAX - MIN)) * 100) / 100;
  };

  // A plain flag for the worklets below: they only need to know whether to call back.
  const notifies = onChange !== undefined;
  const notify = (next: number) => onChange?.(next);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.value = Math.max(0, Math.min(trackWidth, e.x));
      const next = valueAt(e.x);
      if (next === current.value) return;
      current.value = next;
      if (notifies) runOnJS(notify)(next);
    })
    .onEnd((e) => {
      const next = valueAt(e.x);
      current.value = next;
      runOnJS(onCommit)(next);
    });

  const tap = Gesture.Tap().onEnd((e) => {
    x.value = withTiming(Math.max(0, Math.min(trackWidth, e.x)), { duration: 80 });
    const next = valueAt(e.x);
    current.value = next;
    runOnJS(onCommit)(next);
  });

  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fillStyle = useAnimatedStyle(() => {
    const center = trackWidth / 2;
    return { left: Math.min(center, x.value), width: Math.abs(x.value - center) };
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: tokens.ink }]}>{label}</Text>
        <SliderNumber current={current} color={tokens.muted} />
      </View>
      <GestureDetector gesture={gesture}>
        <View style={styles.track} onLayout={handleLayout}>
          <View style={[styles.trackLine, { backgroundColor: tokens.edge }]} />
          <View style={[styles.centerTick, { backgroundColor: tokens.muted }]} />
          <Animated.View style={[styles.trackFill, { backgroundColor: tokens.accent }, fillStyle]} />
          <Animated.View style={[styles.thumb, { backgroundColor: tokens.accent }, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

// The "+35" beside the label. Its own component, so the one thing a drag still tells React - the
// number, and only when it changes - re-renders this text and nothing else: not the slider, not
// the panel, not the screen.
const SliderNumber = memo(function SliderNumber({ current, color }: { current: SharedValue<number>; color: string }) {
  const [shown, setShown] = useState(() => Math.round(current.value * 100));
  useAnimatedReaction(
    () => Math.round(current.value * 100),
    (next, previous) => {
      if (next !== previous) runOnJS(setShown)(next);
    }
  );
  return <Text style={[styles.value, { color }]}>{shown > 0 ? `+${shown}` : shown}</Text>;
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    fontSize: 12,
  },
  track: {
    height: THUMB_SIZE,
    justifyContent: 'center',
  },
  trackLine: {
    position: 'absolute',
    left: THUMB_SIZE / 2,
    right: THUMB_SIZE / 2,
    height: 4,
    borderRadius: 2,
  },
  centerTick: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1,
    width: 2,
    height: 10,
  },
  trackFill: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});
