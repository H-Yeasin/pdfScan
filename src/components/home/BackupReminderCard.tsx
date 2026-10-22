import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { useAppDispatch } from '../../store/AppStateContext';
import { useBackupReminder } from '../../store/useBackupReminder';
import { ICON_SIZE, ICONS, spacing, useTheme } from '../../theme';
import { formatShortDate } from '../../utils/format';
import { Button, Card, Text } from '../ui';

// §8 B5: "Last backup: never. Back up now?", on Home while a backup is due.
export function BackupReminderCard() {
  const { t } = useT();
  const { tokens } = useTheme();
  const dispatch = useAppDispatch();
  const reminder = useBackupReminder();
  if (!reminder.due) return null;
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Ionicons name={ICONS.backup} size={ICON_SIZE.row} color={tokens.accentInk} />
        <Text variant="caption" style={styles.flex} numberOfLines={2}>
          {reminder.lastBackupAt === null ? t('backup.reminder.never') : t('backup.reminder.old', { date: formatShortDate(reminder.lastBackupAt) })}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button variant="ghost" size="sm" label={t('backup.reminder.later')} onPress={reminder.snooze} />
        <Button
          variant="tonal"
          size="sm"
          label={t('backup.reminder.backUp')}
          onPress={() => dispatch({ type: 'ui/REQUEST_EXPORT', request: { scope: { kind: 'all' } } })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
