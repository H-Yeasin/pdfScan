import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { CAPTURE_MODES } from '../../services/capture/captureModes';
import { FILTER_IDS } from '../../services/enhance/filters/filterIds';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import { spacing } from '../../theme';
import { Button, FilterChip, Sheet, Text } from '../ui';

// §17 U10: Me → Scanning → Filters. The filter each capture mode's new pages start with: what
// Review's "Apply to all" sets (settings/SET_DEFAULT_ENHANCE), here for every mode at once. The ids
// come from filterIds, not the registry, which would bring every filter's shaders with Me.
export function ScanFiltersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const byMode = useAppSelector((s) => s.settings.defaultEnhanceByMode);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('settings.scanning.filters')}
      footer={<Button label={t('common.done')} onPress={onClose} fullWidth />}
      testID="scan-filters-sheet"
    >
      <Text variant="caption" color="muted">
        {t('settings.scanning.filtersHint')}
      </Text>
      {CAPTURE_MODES.map((mode) => {
        // settingsSlice.defaultEnhanceFor, from the one field it reads.
        const current = byMode[mode.id] ?? mode.defaultEnhance;
        return (
          <View key={mode.id} style={styles.mode}>
            <Text variant="label" accessibilityRole="header">
              {t(mode.labelKey)}
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {FILTER_IDS.map((id) => (
                <FilterChip
                  key={id}
                  label={t(`review.filters.${id}`)}
                  selected={current === id}
                  onPress={() => dispatch({ type: 'settings/SET_DEFAULT_ENHANCE', mode: mode.id, enhance: id })}
                  testID={`filter-${mode.id}-${id}`}
                />
              ))}
            </View>
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  mode: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
