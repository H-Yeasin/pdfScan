import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { ICONS, spacing, useTheme } from '../../theme';
import { BottomBar } from '../shared/BottomBar';
import { Button, Text } from '../ui';

type StickyActionsProps = {
  saving: boolean;
  // Shown under the buttons while saving (e.g. "Preparing page 3 of 10…").
  progress?: string | null;
  onSave: () => void;
  // §17 U9: opens the Submit sheet (the teacher's copy, §4 S6); Submit there saves and shares.
  // Undefined: no Submit (pages going to the end of a saved document).
  onSubmit?: () => void;
  // What Submit will make, for this course ("Under 2 MB · Page numbers").
  submitSummary?: string;
};

// §17 U9: Save (the screen's one primary action) and Submit… beside it. "Save & Share" went: Done
// offers Share right after the save.
export function StickyActions({ saving, progress, onSave, onSubmit, submitSummary }: StickyActionsProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <BottomBar backgroundColor={tokens.bg}>
      <View style={styles.container}>
        <View style={styles.row}>
          {onSubmit ? (
            <Button
              label={t('deliver.actions.submitMore')}
              variant="tonal"
              icon={ICONS.submit}
              onPress={onSubmit}
              disabled={saving}
              accessibilityHint={submitSummary}
              style={styles.flex}
              testID="save-submit"
            />
          ) : null}
          <Button label={t('deliver.actions.save')} icon={ICONS.save} onPress={onSave} loading={saving} style={styles.flex} testID="save-save" />
        </View>
        {saving && progress ? (
          <Text variant="caption" color="muted" align="center" accessibilityLiveRegion="polite">
            {progress}
          </Text>
        ) : (
          <Text variant="caption" color="muted" align="center" numberOfLines={1}>
            {t('deliver.actions.footnote')}
          </Text>
        )}
      </View>
    </BottomBar>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: { flex: 1 },
});
