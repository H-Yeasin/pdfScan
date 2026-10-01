import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatLimit } from '../../services/submit/sizeTarget';
import { radii, spacing, useTheme } from '../../theme';
import type { Submission } from '../../types/models';
import { formatShortDate } from '../../utils/format';

type SubmissionListProps = {
  submissions: readonly Submission[];
  onShareAgain: (submission: Submission) => void;
  // Opens the submitted document; left out where it's already open (the Reader).
  onOpen?: (submission: Submission) => void;
};

// Files handed in (§4 S7), newest first as given: name, date, size, and Share again / Open.
export function SubmissionList({ submissions, onShareAgain, onOpen }: SubmissionListProps) {
  const { tokens } = useTheme();
  return (
    <View style={styles.list}>
      {submissions.map((s) => {
        const over = s.sizeLimitBytes !== null && s.sizeBytes > s.sizeLimitBytes;
        return (
          <View key={s.id} style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            <Ionicons name="paper-plane-outline" size={18} color={tokens.muted} />
            <View style={styles.text}>
              <Text style={[styles.name, { color: tokens.ink }]} numberOfLines={1}>
                {s.fileName}
              </Text>
              <Text style={[styles.meta, { color: over ? tokens.danger : tokens.muted }]} numberOfLines={1}>
                {formatShortDate(s.createdAt)} · {formatLimit(s.sizeBytes)}
                {over ? ` · over ${formatLimit(s.sizeLimitBytes ?? 0)}` : ''}
              </Text>
            </View>
            {onOpen ? (
              <Pressable style={styles.action} onPress={() => onOpen(s)} accessibilityRole="button" accessibilityLabel={`Open ${s.fileName}`}>
                <Text style={[styles.actionLabel, { color: tokens.accentInk }]}>Open</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.action}
              onPress={() => onShareAgain(s)}
              accessibilityRole="button"
              accessibilityLabel={`Share ${s.fileName} again`}
            >
              <Text style={[styles.actionLabel, { color: tokens.accentInk }]}>Share again</Text>
            </Pressable>
          </View>
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
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12.5,
  },
  action: {
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
