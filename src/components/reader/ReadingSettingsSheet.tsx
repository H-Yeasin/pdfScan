import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { SegmentedControl } from '../shared/SegmentedControl';
import type { ReadingSettings } from '../../services/documents/readingSettings';

type ReadingSettingsSheetProps = {
  visible: boolean;
  reading: ReadingSettings;
  // Layout, fit, spacing and the night page are the page surface's (PDFs and scans); other
  // viewers scroll their own way.
  showPageOptions: boolean;
  onChange: (patch: Partial<ReadingSettings>) => void;
  onClose: () => void;
};

// §12 D2: how the Reader shows documents. Changes apply at once (the viewer behind the sheet
// updates) and are kept in settings for every document.
export function ReadingSettingsSheet({ visible, reading, showPageOptions, onChange, onClose }: ReadingSettingsSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          <Text style={[styles.title, { color: tokens.ink }]}>{t('reader.reading.title')}</Text>
          <ScrollView contentContainerStyle={styles.body} bounces={false}>
            {showPageOptions ? (
              <>
                <Text style={[styles.label, { color: tokens.muted }]}>{t('reader.reading.layout')}</Text>
                <SegmentedControl
                  segments={[
                    { id: 'continuous', label: t('reader.reading.continuous') },
                    { id: 'paged', label: t('reader.reading.paged') },
                  ]}
                  value={reading.layout}
                  onChange={(layout) => onChange({ layout })}
                />
                <Text style={[styles.label, { color: tokens.muted }]}>{t('reader.reading.fit')}</Text>
                <SegmentedControl
                  segments={[
                    { id: 'width', label: t('reader.reading.fitWidth') },
                    { id: 'page', label: t('reader.reading.fitPage') },
                  ]}
                  value={reading.fit}
                  onChange={(fit) => onChange({ fit })}
                />
                <Text style={[styles.label, { color: tokens.muted }]}>{t('reader.reading.spacing')}</Text>
                <SegmentedControl
                  segments={[
                    { id: 'none', label: t('reader.reading.spacingNone') },
                    { id: 'small', label: t('reader.reading.spacingSmall') },
                    { id: 'large', label: t('reader.reading.spacingLarge') },
                  ]}
                  value={reading.spacing}
                  onChange={(spacing) => onChange({ spacing })}
                />
              </>
            ) : null}

            <SwitchRow label={t('reader.reading.night')} value={reading.night} onChange={(night) => onChange({ night })} />
            {reading.night && showPageOptions ? (
              <>
                {/* §18 W10: the pages are redrawn dark; this is how dark the paper is (darkMatrix.NIGHT_PALETTES). */}
                <Text style={[styles.label, { color: tokens.muted }]}>{t('reader.reading.nightPaper')}</Text>
                <SegmentedControl
                  segments={[
                    { id: 'low', label: t('reader.reading.paperLow') },
                    { id: 'medium', label: t('reader.reading.paperMedium') },
                    { id: 'high', label: t('reader.reading.paperHigh') },
                  ]}
                  value={reading.nightStrength}
                  onChange={(nightStrength) => onChange({ nightStrength })}
                />
              </>
            ) : null}
            <SwitchRow
              label={t('reader.reading.keepAwake')}
              hint={t('reader.reading.keepAwakeHint')}
              value={reading.keepAwake}
              onChange={(keepAwake) => onChange({ keepAwake })}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  const { tokens } = useTheme();
  return (
    <Pressable
      style={styles.switchRow}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={styles.switchText}>
        <Text style={[styles.switchLabel, { color: tokens.ink }]}>{label}</Text>
        {hint ? <Text style={[styles.switchHint, { color: tokens.muted }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: tokens.accent, false: tokens.surface2 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    paddingTop: spacing.sm,
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  title: { fontWeight: '700', fontSize: 16, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  body: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, marginTop: spacing.sm },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 15.5 },
  switchHint: { fontSize: 12.5, marginTop: 2 },
});
