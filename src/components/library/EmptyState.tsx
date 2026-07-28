import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fontFamily, radii, spacing, useTheme } from '../../theme';

type EmptyStateProps = {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, body, actionLabel, onAction }: EmptyStateProps) {
  const { tokens } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: tokens.muted }]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={[styles.action, { backgroundColor: tokens.accent }]} onPress={onAction}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  action: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
