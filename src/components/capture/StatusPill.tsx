import { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

type StatusPillProps = PropsWithChildren<{
  icon?: ReactNode;
  variant?: 'translucent' | 'solid';
  textColor?: string;
  style?: ViewStyle;
}>;

export function StatusPill({
  icon,
  children,
  variant = 'translucent',
  textColor = colors.textPrimary,
  style,
}: StatusPillProps) {
  return (
    <View
      style={[
        styles.pill,
        variant === 'solid' ? styles.solid : styles.translucent,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignSelf: 'center',
  },
  translucent: {
    backgroundColor: colors.surfaceTranslucent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  solid: {
    backgroundColor: colors.accent,
  },
  text: {
    fontSize: typography.pill.fontSize,
    fontWeight: typography.pill.fontWeight,
  },
});
