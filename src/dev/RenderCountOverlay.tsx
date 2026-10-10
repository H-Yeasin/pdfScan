import { useRef } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../theme';
import { resetRenderCounts, useRenderCounts, useRenderCountsShown } from '../utils/renderCounts';

// §16 G5, dev only: the render counts (renderCounts.ts) in a corner, over everything. A name whose
// count moved since the overlay last drew is in the accent colour, so "what re-rendered when I
// typed a letter" reads at a glance. Tap it to set every count back to zero.
export function RenderCountOverlay() {
  const shown = useRenderCountsShown();
  const counts = useRenderCounts();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const previous = useRef(counts);
  const before = previous.current;
  previous.current = counts;
  if (!shown) return null;

  const names = Object.keys(counts).sort();
  return (
    <Pressable
      testID="render-counts"
      accessibilityRole="button"
      accessibilityLabel="Render counts. Tap to reset."
      onPress={resetRenderCounts}
      style={[styles.box, { top: insets.top + spacing.sm, backgroundColor: tokens.surface, borderColor: tokens.edge }]}
    >
      {names.length === 0 ? <Text style={[styles.line, { color: tokens.muted }]}>renders: 0</Text> : null}
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
    borderRadius: radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.9,
  },
  line: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
