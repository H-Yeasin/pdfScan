import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typeScale, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

// §10 M3: marks a Pro feature next to its name for students without Pro (M4 places it). Hidden
// while Pro is active is the caller's choice; the badge itself always shows.
export function ProBadge() {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <View style={[styles.badge, { backgroundColor: tokens.accentSoft }]} accessible accessibilityLabel={t('pro.badgeLabel')}>
      <Text style={[styles.text, { color: tokens.accentInk, fontFamily: typeScale.label.fontFamily }]}>{t('pro.badge')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  text: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
});
