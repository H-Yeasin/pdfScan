import { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { radii, spacing, typeScale } from '../../theme';

type PillProps = PropsWithChildren<{
  icon?: ReactNode;
  backgroundColor: string;
  borderColor?: string;
  textColor: string;
  style?: ViewStyle;
}>;

export function Pill({ icon, children, backgroundColor, borderColor, textColor, style }: PillProps) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor, borderColor: borderColor ?? 'transparent', borderWidth: borderColor ? StyleSheet.hairlineWidth : 0 },
        style,
      ]}
    >
      {icon}
      <Text style={[styles.text, { color: textColor, fontFamily: typeScale.label.fontFamily }]} numberOfLines={1}>
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
  text: {
    fontSize: typeScale.label.fontSize,
  },
});
