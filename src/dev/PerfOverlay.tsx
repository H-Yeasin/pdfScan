import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../theme';
import { perfMark } from '../utils/perfMarks';
import { resetRenderCounts, useRenderCounts, useRenderCountsShown } from '../utils/renderCounts';
import { createFrameMeter, formatSeconds, readStartup, type FrameReading, type RnPerformance, type StartupReading } from './perfStats';

// §16 G9 (G5's render-count overlay, grown), dev only: in a corner, over everything,
//  - the JS frame rate over the last second and the slowest JS frame since the last reset (a
//    requestAnimationFrame counter: it shows the JS thread, not the UI thread; Android's GPU bars
//    or `dumpsys gfxinfo` show that one, see docs/qa/performance.md);
//  - the time since the process started, when the JS bundle began to run, when the first screen
//    was up (perfMarks 'firstScreen'), and the JS heap;
//  - the render counts (utils/renderCounts.ts); a name whose count moved since the overlay last
//    drew is in the accent colour, so "what re-rendered when I typed a letter" reads at a glance.
// Tap it to set the counts and the slowest frame back to zero.
//
// A dev build's numbers are upper bounds (no minification, the dev runtime's checks); the budgets
// are measured on a release build, this is for finding what moved.

const READ_EVERY_MS = 500;

function useFrames(): [FrameReading, () => void] {
  const meter = useRef(createFrameMeter()).current;
  const [reading, setReading] = useState<FrameReading>(() => meter.read());
  useEffect(() => {
    let raf = requestAnimationFrame(function tick(t) {
      meter.frame(t);
      raf = requestAnimationFrame(tick);
    });
    const id = setInterval(() => setReading(meter.read()), READ_EVERY_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [meter]);
  return [reading, meter.reset];
}

function startup(): StartupReading {
  return readStartup(performance as unknown as RnPerformance, perfMark('firstScreen'));
}

export function PerfOverlay() {
  const shown = useRenderCountsShown();
  if (!shown) return null;
  return <Overlay />;
}

// Mounted only while shown, so the frame loop runs only then.
function Overlay() {
  const counts = useRenderCounts();
  const [frames, resetFrames] = useFrames();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  // The counts before the latest change, not before the latest render: the frame reading
  // re-renders this twice a second, which would otherwise clear the highlight at once.
  const seen = useRef({ current: counts, before: counts });
  if (seen.current.current !== counts) seen.current = { current: counts, before: seen.current.current };
  const before = seen.current.before;
  // Read on every render: the frame reading re-renders this twice a second, which keeps it current.
  const boot = startup();

  const names = Object.keys(counts).sort();
  const line = [styles.line, { color: tokens.muted }];
  return (
    <Pressable
      testID="perf-overlay"
      accessibilityRole="button"
      accessibilityLabel="Performance overlay. Tap to reset."
      onPress={() => {
        resetRenderCounts();
        resetFrames();
      }}
      style={[styles.box, { top: insets.top + spacing.sm, backgroundColor: tokens.surface, borderColor: tokens.edge }]}
    >
      <Text style={[styles.line, { color: frames.fps < 55 ? tokens.accentInk : tokens.ink }]}>
        js {frames.fps} fps · worst {frames.worstMs} ms
      </Text>
      <Text style={line}>up {formatSeconds(boot.sinceStartMs)}</Text>
      {boot.bundleAtMs !== undefined ? <Text style={line}>bundle at {boot.bundleAtMs} ms</Text> : null}
      {boot.firstScreenAtMs !== undefined ? <Text style={line}>screen at {boot.firstScreenAtMs} ms</Text> : null}
      {boot.heapMb !== undefined ? <Text style={line}>heap {boot.heapMb} MB</Text> : null}
      {names.length === 0 ? <Text style={line}>renders: 0</Text> : null}
      {names.map((name) => (
        <Text key={name} style={[styles.line, { color: counts[name] !== before[name] ? tokens.accentInk : tokens.muted }]}>
          {name} {counts[name]}
        </Text>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.xs,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.9,
  },
  line: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
