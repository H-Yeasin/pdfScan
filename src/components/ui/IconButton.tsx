import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ICON_SIZE, radii, useTheme, type IoniconName } from '../../theme';
import { Badge } from './Badge';
import { Touchable } from './Touchable';

// §17 U2: a round icon-only button, 44 dp drawn (36 for `sm`), 48 dp to touch (Touchable adds the
// slop). An icon has no text for TalkBack to read, so accessibilityLabel is required.
// `plain` sits in a bar, `tonal` is a toggle that is on or a second action, `filled` is a primary
// action in icon form. `selected` is for toggles (Find open, a tool picked): it draws tonal and says
// "selected".

export type IconButtonVariant = 'plain' | 'tonal' | 'filled';

export type IconButtonProps = {
  icon: IoniconName;
  accessibilityLabel: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: IconButtonVariant;
  size?: 'md' | 'sm';
  selected?: boolean;
  disabled?: boolean;
  // A dot (true) or a count on the top-right corner.
  badge?: boolean | number;
  // The icon's colour on a plain button, for chrome over a photo or the camera.
  color?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const ICON_BUTTON_SIZE = { md: 44, sm: 36 } as const;

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  onLongPress,
  variant = 'plain',
  size = 'md',
  selected,
  disabled = false,
  badge,
  color,
  accessibilityHint,
  style,
  testID,
}: IconButtonProps) {
  const { tokens } = useTheme();
  const look = selected && variant === 'plain' ? 'tonal' : variant;
  const bg = look === 'filled' ? tokens.accent : look === 'tonal' ? tokens.accentSoft : 'transparent';
  const fg = look === 'filled' ? tokens.onAccent : look === 'tonal' ? tokens.accentInk : (color ?? tokens.ink);
  const box = ICON_BUTTON_SIZE[size];

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      ripple={look === 'filled' ? 'onFill' : 'default'}
      rippleRadius={box / 2}
      testID={testID}
      style={[styles.base, { width: box, height: box, backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, style]}
    >
      <Ionicons name={icon} size={size === 'md' ? ICON_SIZE.bar : ICON_SIZE.row} color={fg} />
      {badge ? (
        <View style={styles.badge} pointerEvents="none">
          <Badge count={typeof badge === 'number' ? badge : undefined} tone="highlight" />
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
});
