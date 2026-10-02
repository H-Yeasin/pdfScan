import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

type HintProps = {
  text: string;
  onDismiss: () => void;
  // Which way the arrow points: at the anchor above (`up`) or below (`down`) the callout. `none`
  // for a hint shown inline next to what it's about.
  arrow?: 'up' | 'down' | 'none';
  // Where the arrow sits along the callout's edge.
  arrowAlign?: 'left' | 'center' | 'right';
  style?: StyleProp<ViewStyle>;
};

const ARROW = 8;

// §9 O3: a one-time hint's callout (shown through useHint). The caller positions it next to its
// anchor. Announced politely to screen readers; "Got it" closes it.
export function Hint({ text, onDismiss, arrow = 'none', arrowAlign = 'center', style }: HintProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const arrowStyle = [
    styles.arrow,
    arrowAlign === 'left' ? styles.arrowLeft : arrowAlign === 'right' ? styles.arrowRight : styles.arrowCenter,
    arrow === 'up'
      ? { top: -ARROW, borderBottomWidth: ARROW, borderBottomColor: tokens.ink }
      : { bottom: -ARROW, borderTopWidth: ARROW, borderTopColor: tokens.ink },
  ];
  return (
    <View style={[styles.callout, { backgroundColor: tokens.ink }, style]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      {arrow !== 'none' ? <View style={arrowStyle} /> : null}
      <Text style={[styles.text, { color: tokens.bg }]}>{text}</Text>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.gotIt, { color: tokens.bg }]}>{t('shared.hint.gotIt')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.card,
    maxWidth: 320,
  },
  text: {
    flexShrink: 1,
    fontSize: 13.5,
    lineHeight: 19,
  },
  gotIt: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowLeft: { left: spacing.lg },
  arrowCenter: { left: '50%', marginLeft: -ARROW },
  arrowRight: { right: spacing.lg },
});
