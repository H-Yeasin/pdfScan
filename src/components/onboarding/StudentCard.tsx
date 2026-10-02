import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import type { StudentCard as Card } from '../../services/onboarding/onboarding';
import { fontFamily, radii, spacing, useTheme } from '../../theme';
import { useReducedMotion } from '../../theme/useReducedMotion';

const MAX_CHIPS = 4;

// Onboarding's student card (see services/onboarding.studentCard): an ID-card-shaped preview that
// fills in live as the student types their name, roll number and courses. Each step that gets
// filled gives the card a small pop (skipped with reduce motion), and the bar along the bottom
// shows how much is done. One element for screen readers, read as a summary.
export function StudentCard({ card }: { card: Card }) {
  const { tokens } = useTheme();
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
      style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge, transform: [{ scale }] }]}
      accessible
      accessibilityLabel={a11y}
    >
      <View style={[styles.band, { backgroundColor: tokens.accent }]}>
        <Text style={[styles.bandTitle, { color: tokens.onAccent }]} numberOfLines={1}>
          {t('onboarding.card.label')}
        </Text>
        <Text style={[styles.bandSemester, { color: tokens.onAccent }]} numberOfLines={1}>
          {card.semester}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={[styles.avatar, { backgroundColor: tokens.accentSoft }]}>
          {card.initials ? (
            <Text style={[styles.initials, { color: tokens.accentInk }]}>{card.initials}</Text>
          ) : (
            <Ionicons name="person-outline" size={26} color={tokens.accentInk} />
          )}
        </View>
        <View style={styles.identity}>
          <Text style={[styles.name, { color: card.name ? tokens.ink : tokens.muted }]} numberOfLines={1}>
            {card.name || t('onboarding.card.namePlaceholder')}
          </Text>
          <Text style={[styles.roll, { color: card.roll ? tokens.ink : tokens.muted }]} numberOfLines={1}>
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
                <Text style={[styles.chipLabel, { color: tokens.ink }]} numberOfLines={1}>
                  {course.label}
                </Text>
              </View>
            ))}
            {extra > 0 ? (
              <Text style={[styles.more, { color: tokens.muted }]}>{t('onboarding.card.more', { count: extra })}</Text>
            ) : null}
          </>
        ) : (
          <View style={[styles.chip, styles.chipEmpty, { borderColor: tokens.edge }]}>
            <Text style={[styles.chipLabel, { color: tokens.muted }]}>{t('onboarding.card.coursesPlaceholder')}</Text>
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
          <Text style={[styles.statusText, { color: ready ? tokens.accentInk : tokens.muted }]}>
            {ready ? t('onboarding.card.ready') : t('onboarding.card.progress', { done: card.done, total: card.total })}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card + 4,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
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
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  bandSemester: {
    fontSize: 12.5,
    fontWeight: '600',
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
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fontFamily.heading,
    fontSize: 22,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: fontFamily.heading,
    fontSize: 20,
  },
  roll: {
    fontSize: 14,
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
    borderRadius: 4,
  },
  chipLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  more: {
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: 3,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
