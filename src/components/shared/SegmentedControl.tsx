import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, typeScale, useTheme } from '../../theme';

type Segment<T extends string> = { id: T; label: string };

type SegmentedControlProps<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ segments, value, onChange }: SegmentedControlProps<T>) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
      {segments.map((segment) => {
        const active = segment.id === value;
        return (
          <Pressable key={segment.id} style={styles.segment} onPress={() => onChange(segment.id)}>
            {active && (
              <View style={[StyleSheet.absoluteFill, styles.activeFill, { backgroundColor: tokens.accent }]} />
            )}
            <Text style={[styles.label, { color: active ? '#fff' : tokens.ink }, active && { fontWeight: '700' }]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFill: {
    borderRadius: radii.full,
  },
  label: {
    fontSize: typeScale.label.fontSize,
    fontFamily: typeScale.label.fontFamily,
  },
});
