import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useT } from '../../i18n/useT';
import { radii, spacing, useTheme, type ThemeTokens } from '../../theme';
import { onDanger } from './kitColors';
import { Text } from './Text';

// §17 U2: a small label on something else. `kind` gives the two fixed ones ("PRO", "NEW");
// `count` a number (99+ past 99); with neither and no `label` it is a dot. `pro` is marigold, the
// Pro colour everywhere.

export type BadgeTone = 'accent' | 'highlight' | 'danger' | 'neutral';

export type BadgeProps = {
  kind?: 'pro' | 'new';
  count?: number;
  label?: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
};

export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function colorsFor(tone: BadgeTone, tokens: ThemeTokens): { bg: string; fg: string } {
  switch (tone) {
    case 'accent':
      return { bg: tokens.accent, fg: tokens.onAccent };
    case 'highlight':
      return { bg: tokens.highlight, fg: tokens.onHighlight };
    case 'danger':
      return { bg: tokens.danger, fg: onDanger(tokens) };
    case 'neutral':
      return { bg: tokens.surface2, fg: tokens.ink };
  }
}

export function Badge({ kind, count, label, tone, style }: BadgeProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const text = kind === 'pro' ? t('ui.badge.pro') : kind === 'new' ? t('ui.badge.new') : count !== undefined ? badgeText(count) : label;
  const colors = colorsFor(tone ?? (kind === 'new' ? 'accent' : 'highlight'), tokens);

  if (!text) return <View style={[styles.dot, { backgroundColor: colors.bg, borderColor: tokens.surface }, style]} />;
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }, style]}>
      <Text variant="overline" color={colors.fg} numberOfLines={1} chrome style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  pill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  // The overline's tracking is for headers; a badge is too small for it.
  text: {
    letterSpacing: 0.3,
    lineHeight: 14,
  },
});
