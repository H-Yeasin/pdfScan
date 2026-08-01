import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { spacing, useTheme } from '../../theme';

const THUMB_SIZE = 20;
const MIN = -1;
const MAX = 1;

type AdjustSliderProps = {
  label: string;
  value: number; // -1..1, 0 is the centered/no-op position
  // Fires continuously while dragging, for a live numeric label — cheap, no bake triggered.
  onChange: (value: number) => void;
  // Fires once on release/tap — this is what should actually trigger the (expensive) Skia bake.
  onCommit: (value: number) => void;
};

// Modeled on the existing QualitySlider (same Pan+Tap-over-a-track pattern), but continuous
// rather than 5-step, and fills from the center out rather than from the left edge, since -1..1
// is a bidirectional adjustment around a neutral zero rather than a magnitude from a floor.
export function AdjustSlider({ label, value, onChange, onCommit }: AdjustSliderProps) {
  const { tokens } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useSharedValue(0);

  const toX = (v: number) => trackWidth <= 0 ? 0 : ((v - MIN) / (MAX - MIN)) * trackWidth;
  const toValue = (px: number) => (trackWidth <= 0 ? 0 : MIN + (px / trackWidth) * (MAX - MIN));

  useEffect(() => {
    if (trackWidth > 0) x.value = withTiming(toX(value), { duration: 80 });
  }, [trackWidth, value]);

  const handleLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  const live = (rawX: number) => onChange(Math.round(toValue(rawX) * 100) / 100);
  const commit = (rawX: number) => onCommit(Math.round(toValue(rawX) * 100) / 100);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const clamped = Math.max(0, Math.min(trackWidth, e.x));
      x.value = clamped;
      runOnJS(live)(clamped);
    })
    .onEnd((e) => {
      runOnJS(commit)(Math.max(0, Math.min(trackWidth, e.x)));
    });

  const tap = Gesture.Tap().onEnd((e) => {
    const clamped = Math.max(0, Math.min(trackWidth, e.x));
    x.value = withTiming(clamped, { duration: 80 });
    runOnJS(commit)(clamped);
  });

  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fillStyle = useAnimatedStyle(() => {
    const center = trackWidth / 2;
    return { left: Math.min(center, x.value), width: Math.abs(x.value - center) };
  });

  const displayValue = Math.round(value * 100);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: tokens.ink }]}>{label}</Text>
        <Text style={[styles.value, { color: tokens.muted }]}>
          {displayValue > 0 ? `+${displayValue}` : displayValue}
        </Text>
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
