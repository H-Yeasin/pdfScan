import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { ICON_SIZE, ICONS, radii, spacing, useTheme, type IoniconName } from '../../theme';
import { Button, IconButton, Text } from '../ui';

// §17 U9: the one suggestion over Review's toolbar (services/review/suggestion.ts picks which):
// what it is, at most one action, and a × that closes it for this page.

type SuggestionChipProps = {
  icon: IoniconName;
  message: string;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  onDismiss: () => void;
};

export function SuggestionChip({ icon, message, action, onDismiss }: SuggestionChipProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <View style={[styles.chip, { backgroundColor: tokens.surface, borderColor: tokens.edge }]} accessibilityLiveRegion="polite" testID="review-suggestion">
      <Ionicons name={icon} size={ICON_SIZE.row} color={tokens.accentInk} />
      <Text variant="caption" style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {action ? <Button label={action.label} size="sm" variant="tonal" onPress={action.onPress} disabled={action.disabled} /> : null}
      <IconButton icon={ICONS.close} size="sm" accessibilityLabel={t('review.suggest.dismiss')} onPress={onDismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: { flex: 1 },
});
