import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextPromptModal } from '../shared/TextPromptModal';
import { formatLimit, MB } from '../../services/submit/sizeTarget';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

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
  const { t } = useT();
  const [customOpen, setCustomOpen] = useState(false);
  const isCustom = value !== null && !PRESETS.includes(value);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip label={t('deliver.size.original')} selected={value === null} onPress={() => onChange(null)} />
        {PRESETS.map((bytes, i) => (
          <Chip key={bytes} label={i === 0 ? t('deliver.size.under', { size: formatLimit(bytes) }) : formatLimit(bytes)} selected={value === bytes} onPress={() => onChange(bytes)} />
        ))}
        <Chip label={isCustom ? t('deliver.size.customValue', { size: formatLimit(value) }) : t('deliver.size.custom')} selected={isCustom} onPress={() => setCustomOpen(true)} />
      </ScrollView>
      {value !== null ? (
        <Text style={[styles.hint, { color: tokens.muted }]}>
          {t('deliver.size.mbHint')}
        </Text>
      ) : null}
      <TextPromptModal
        visible={customOpen}
        title={t('deliver.size.customTitle', { min: CUSTOM_MIN_MB, max: CUSTOM_MAX_MB })}
        initialValue={isCustom ? String(value / MB) : ''}
        placeholder={t('deliver.size.customPlaceholder')}
        submitLabel={t('deliver.size.setLimit')}
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
