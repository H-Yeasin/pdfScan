import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { spacing, useTheme } from '../../theme';

const STEPS = 5;
const THUMB_SIZE = 22;

type QualitySliderProps = {
  value: number; // 1-5
  onChange: (value: number) => void;
};

export function QualitySlider({ value, onChange }: QualitySliderProps) {
  const { tokens } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useSharedValue(0);

  const stepWidth = trackWidth / (STEPS - 1);

  useEffect(() => {
    if (trackWidth > 0) x.value = withTiming((value - 1) * stepWidth, { duration: 80 });
  }, [trackWidth, value, stepWidth, x]);

  const handleLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  const commit = (rawX: number) => {
    if (trackWidth <= 0) return;
    const step = Math.round((rawX / trackWidth) * (STEPS - 1));
    const nextQuality = Math.max(1, Math.min(STEPS, step + 1));
    x.value = withTiming((nextQuality - 1) * stepWidth, { duration: 80 });
    onChange(nextQuality);
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.value = Math.max(0, Math.min(trackWidth, e.x));
    })
    .onEnd((e) => {
      runOnJS(commit)(Math.max(0, Math.min(trackWidth, e.x)));
    });

  const tap = Gesture.Tap().onEnd((e) => {
    runOnJS(commit)(Math.max(0, Math.min(trackWidth, e.x)));
  });

  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + THUMB_SIZE / 2,
  }));

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View style={styles.track} onLayout={handleLayout}>
          <View style={[styles.trackLine, { backgroundColor: tokens.edge }]} />
          <Animated.View style={[styles.trackFill, { backgroundColor: tokens.accent }, fillStyle]} />
          <Animated.View style={[styles.thumb, { backgroundColor: tokens.accent }, thumbStyle]} />
        </View>
      </GestureDetector>
      <View style={styles.labels}>
        <Text style={[styles.labelText, { color: tokens.muted }]}>Small</Text>
        <Text style={[styles.labelText, { color: tokens.muted }]}>High</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 32,
    justifyContent: 'center',
  },
  trackLine: {
    position: 'absolute',
    left: THUMB_SIZE / 2,
    right: THUMB_SIZE / 2,
    height: 4,
    borderRadius: 2,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
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
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  labelText: {
    fontSize: 13,
  },
});
