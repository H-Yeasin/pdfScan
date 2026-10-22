import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import type { StudentCard as Card } from '../../services/onboarding/onboarding';
import { elevation, radii, spacing, useTheme } from '../../theme';
import { Text } from '../ui';
import { useReducedMotion } from '../../theme/useReducedMotion';

const MAX_CHIPS = 4;

// Onboarding's student card (see services/onboarding.studentCard): an ID-card-shaped preview that
// fills in live as the student types their name, roll number and courses. Each step that gets
// filled gives the card a small pop (skipped with reduce motion), and the bar along the bottom
// shows how much is done. One element for screen readers, read as a summary.
export function StudentCard({ card }: { card: Card }) {
  const { tokens, theme } = useTheme();
  const { t } = useT();
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const lastDone = useRef(card.done);

  useEffect(() => {
    const grew = card.done > lastDone.current;
    lastDone.current = card.done;
    if (!grew || reducedMotion) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.035, duration: 120, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  }, [card.done, reducedMotion, scale]);

  const ready = card.done === card.total;
  const shown = card.courses.slice(0, MAX_CHIPS);
  const extra = card.courses.length - shown.length;
  const a11y = t('onboarding.card.a11y', {
    name: card.name || t('onboarding.card.namePlaceholder'),
    roll: card.roll ? t('onboarding.card.roll', { roll: card.roll }) : t('onboarding.card.rollPlaceholder'),
    courses: card.courses.length
      ? `${t('onboarding.card.a11yCourses', { count: card.courses.length })}: ${card.courses.map((c) => c.label).join(', ')}`
      : t('onboarding.card.a11yNoCourses'),
    progress: ready ? t('onboarding.card.ready') : t('onboarding.card.progress', { done: card.done, total: card.total }),
  });

  return (
    <Animated.View
      style={[styles.card, elevation(2, theme), { borderColor: tokens.edge, transform: [{ scale }] }]}
      accessible
      accessibilityLabel={a11y}
    >
      <View style={[styles.band, { backgroundColor: tokens.accent }]}>
        <Text variant="label" color="onAccent" numberOfLines={1} style={styles.bandTitle}>
          {t('onboarding.card.label')}
        </Text>
        <Text variant="label" color="onAccent" numberOfLines={1}>
          {card.semester}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={[styles.avatar, { backgroundColor: tokens.accentSoft }]}>
          {card.initials ? (
            <Text variant="title" color="accentInk">
              {card.initials}
            </Text>
          ) : (
            <Ionicons name="person-outline" size={26} color={tokens.accentInk} />
          )}
        </View>
        <View style={styles.identity}>
          <Text variant="title" color={card.name ? 'ink' : 'muted'} numberOfLines={1}>
            {card.name || t('onboarding.card.namePlaceholder')}
          </Text>
          <Text variant="body" color={card.roll ? 'ink' : 'muted'} numberOfLines={1} style={styles.roll}>
            {card.roll ? t('onboarding.card.roll', { roll: card.roll }) : t('onboarding.card.rollPlaceholder')}
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        {shown.length ? (
          <>
            {shown.map((course, i) => (
              <View key={`${course.label}-${i}`} style={[styles.chip, { borderColor: course.color }]}>
                <View style={[styles.chipDot, { backgroundColor: course.color }]} />
                <Text variant="label" numberOfLines={1} style={styles.chipLabel}>
                  {course.label}
                </Text>
              </View>
            ))}
            {extra > 0 ? (
              <Text variant="label" color="muted">
                {t('onboarding.card.more', { count: extra })}
              </Text>
            ) : null}
          </>
        ) : (
          <View style={[styles.chip, styles.chipEmpty, { borderColor: tokens.edge }]}>
            <Text variant="label" color="muted" style={styles.chipLabel}>
              {t('onboarding.card.coursesPlaceholder')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.segments}>
          {Array.from({ length: card.total }, (_, i) => (
            <View key={i} style={[styles.segment, { backgroundColor: i < card.done ? tokens.accent : tokens.surface2 }]} />
          ))}
        </View>
        <View style={styles.status}>
          {ready ? <Ionicons name="checkmark-circle" size={15} color={tokens.accentInk} /> : null}
          <Text variant="caption" weight="semibold" color={ready ? 'accentInk' : 'muted'}>
            {ready ? t('onboarding.card.ready') : t('onboarding.card.progress', { done: card.done, total: card.total })}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bandTitle: {
    flexShrink: 1,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  roll: {
    fontVariant: ['tabular-nums'],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 140,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  chipEmpty: {
    borderStyle: 'dashed',
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  chipLabel: {
    flexShrink: 1,
  },
  footer: {
    gap: spacing.xs,
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: radii.full,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
