import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDue } from '../../services/submit/deadlines';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import type { Deadline } from '../../types/models';

type DeadlineListProps = {
  deadlines: readonly Deadline[];
  now: number;
  onPress: (deadline: Deadline) => void;
  // Shown before the title (Home lists several courses).
  courseLabel?: (deadline: Deadline) => string | undefined;
  // The one a tapped reminder points at: outlined, with "Scan now".
  highlightId?: string | null;
  onScanNow?: (deadline: Deadline) => void;
};

// Open deadlines, soonest first as given; overdue ones in the danger colour.
export function DeadlineList({ deadlines, now, onPress, courseLabel, highlightId, onScanNow }: DeadlineListProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <View style={styles.list}>
      {deadlines.map((d) => {
        const overdue = d.dueAt < now;
        const highlighted = d.id === highlightId;
        const label = courseLabel?.(d);
        return (
          <Pressable
            key={d.id}
            onPress={() => onPress(d)}
            accessibilityRole="button"
            style={[
              styles.row,
              { backgroundColor: tokens.surface, borderColor: highlighted ? tokens.accent : tokens.edge, borderWidth: highlighted ? 2 : StyleSheet.hairlineWidth },
            ]}
          >
            <Ionicons name={overdue ? 'alert-circle-outline' : 'time-outline'} size={18} color={overdue ? tokens.danger : tokens.muted} />
            <View style={styles.text}>
              <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
                {label ? `${label} · ` : ''}
                {d.title}
              </Text>
              <Text style={[styles.meta, { color: overdue ? tokens.danger : tokens.muted }]} numberOfLines={1}>
                {overdue ? t('deadlines.overdue', { due: formatDue(d.dueAt, now) }) : t('deadlines.dueAt', { due: formatDue(d.dueAt, now) })}
              </Text>
            </View>
            {highlighted && onScanNow ? (
              <Pressable
                style={[styles.scan, { backgroundColor: tokens.accent }]}
                onPress={() => onScanNow(d)}
                accessibilityRole="button"
                accessibilityLabel={t('deadlines.scanNowA11y', { title: d.title })}
              >
                <Ionicons name="scan" size={16} color={tokens.onAccent} />
                <Text style={[styles.scanLabel, { color: tokens.onAccent }]}>{t('deadlines.scanNow')}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12.5,
  },
  scan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
  },
  scanLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
