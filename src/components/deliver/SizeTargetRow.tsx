import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextPromptModal } from '../shared/TextPromptModal';
import { formatLimit, MB } from '../../services/submit/sizeTarget';
import { radii, spacing, useTheme } from '../../theme';

const PRESETS = [1, 2, 5, 10].map((mb) => mb * MB);
// Below this a scan page can't stay readable; above it nobody needs a limit.
const CUSTOM_MIN_MB = 0.1;
const CUSTOM_MAX_MB = 100;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface },
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? tokens.accentInk : tokens.ink }]}>{label}</Text>
    </Pressable>
  );
}

// Deliver's size target: Original (the quality slider decides) or a limit the PDF is built to fit.
export function SizeTargetRow({ value, onChange }: { value: number | null; onChange: (bytes: number | null) => void }) {
  const { tokens } = useTheme();
  const [customOpen, setCustomOpen] = useState(false);
  const isCustom = value !== null && !PRESETS.includes(value);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip label="Original" selected={value === null} onPress={() => onChange(null)} />
        {PRESETS.map((bytes, i) => (
          <Chip key={bytes} label={i === 0 ? `Under ${formatLimit(bytes)}` : formatLimit(bytes)} selected={value === bytes} onPress={() => onChange(bytes)} />
        ))}
        <Chip label={isCustom ? `Custom · ${formatLimit(value)}` : 'Custom'} selected={isCustom} onPress={() => setCustomOpen(true)} />
      </ScrollView>
      {value !== null ? (
        <Text style={[styles.hint, { color: tokens.muted }]}>
          1 MB here is 1,000,000 bytes, the way upload forms count. Quality is chosen to fit.
        </Text>
      ) : null}
      <TextPromptModal
        visible={customOpen}
        title={`Size limit in MB (${CUSTOM_MIN_MB}–${CUSTOM_MAX_MB})`}
        initialValue={isCustom ? String(value / MB) : ''}
        placeholder="e.g. 1.5"
        submitLabel="Set limit"
        keyboardType="decimal-pad"
        onCancel={() => setCustomOpen(false)}
        onSubmit={(text) => {
          const mb = Number(text.replace(',', '.'));
          setCustomOpen(false);
          if (Number.isFinite(mb) && mb >= CUSTOM_MIN_MB && mb <= CUSTOM_MAX_MB) onChange(Math.round(mb * MB));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
  },
});
