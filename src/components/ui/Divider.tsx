import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { spacing, useTheme } from '../../theme';
import { ICON_WELL } from './ListItem';

// §17 U2: a hairline between rows or sections. `inset` lines it up with a ListItem's text (the
// 16 dp padding, plus the 36 dp icon well and its 12 dp gap when the rows have icons).

export type DividerProps = {
  inset?: 'none' | 'text' | 'icon';
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
};

const INSET = { none: 0, text: spacing.lg, icon: spacing.lg + ICON_WELL + spacing.md } as const;

export function Divider({ inset = 'none', vertical = false, style }: DividerProps) {
  const { tokens } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        vertical ? { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' } : { height: StyleSheet.hairlineWidth, marginLeft: INSET[inset] },
        { backgroundColor: tokens.edge },
        style,
      ]}
    />
  );
}
