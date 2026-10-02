import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fontFamily, radii, spacing, useTheme } from '../../theme';

type EmptyAction = { label: string; onPress: () => void };

type EmptyStateProps = {
  title: string;
  body?: string;
  // §9 O3: every empty place says what to do next - one main action, optionally a second.
  action?: EmptyAction;
  secondaryAction?: EmptyAction;
  // `screen` fills the space a list would (Library, a course); `inline` sits in a section or a
  // sheet (bookmarks, deadlines, the exam pack).
  variant?: 'screen' | 'inline';
};

// §9 O3: the one empty state used everywhere (moved from components/library). The inventory of
// empty places is in docs/plan/09-onboarding.md (O3, As built).
export function EmptyState({ title, body, action, secondaryAction, variant = 'screen' }: EmptyStateProps) {
  const { tokens } = useTheme();
  const inline = variant === 'inline';

  return (
    <View style={inline ? styles.inline : styles.screen}>
      <Text style={[inline ? styles.titleInline : styles.title, { color: tokens.ink }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: tokens.muted }]}>{body}</Text> : null}
      {action || secondaryAction ? (
        <View style={styles.actions}>
          {action ? (
            <Pressable style={[styles.action, { backgroundColor: tokens.accent }]} onPress={action.onPress} accessibilityRole="button">
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ) : null}
          {secondaryAction ? (
            <Pressable
              style={[styles.action, { borderColor: tokens.edge, borderWidth: StyleSheet.hairlineWidth }]}
              onPress={secondaryAction.onPress}
              accessibilityRole="button"
            >
              <Text style={[styles.actionLabel, { color: tokens.accentInk }]}>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  inline: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 22,
    textAlign: 'center',
  },
  titleInline: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  action: {
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
