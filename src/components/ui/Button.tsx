import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ICON_SIZE, radii, spacing, useTheme, type IoniconName, type ThemeTokens, type TypeVariant } from '../../theme';
import { onDanger } from './kitColors';
import { Text } from './Text';
import { Touchable } from './Touchable';

// §17 U2: the one button. There were 35 primary-button styles at heights 34-52; now there are three
// sizes and six looks. `primary` is the screen's main action (one per screen), `tonal` a second
// one, `outline` and `ghost` the quiet ones, `danger` a destructive confirm, `highlight` (marigold)
// for Pro and celebration only.

export type ButtonVariant = 'primary' | 'tonal' | 'outline' | 'ghost' | 'danger' | 'highlight';
export type ButtonSize = 'lg' | 'md' | 'sm';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  // An Ionicon, from theme ICONS for an action.
  icon?: IoniconName;
  // Shows a spinner over the label; the label stays (invisible) so the width doesn't jump.
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const BUTTON_HEIGHT: Record<ButtonSize, number> = { lg: 52, md: 44, sm: 36 };
const PAD_X: Record<ButtonSize, number> = { lg: spacing.xl, md: spacing.lg, sm: spacing.md };
const LABEL_VARIANT: Record<ButtonSize, TypeVariant> = { lg: 'bodyStrong', md: 'label', sm: 'label' };
const ICON: Record<ButtonSize, number> = { lg: ICON_SIZE.row, md: ICON_SIZE.row, sm: ICON_SIZE.inline };

type Look = { bg: string; fg: string; border?: string; onFill: boolean };

export function buttonLook(variant: ButtonVariant, tokens: ThemeTokens): Look {
  switch (variant) {
    case 'primary':
      return { bg: tokens.accent, fg: tokens.onAccent, onFill: true };
    case 'tonal':
      return { bg: tokens.accentSoft, fg: tokens.accentInk, onFill: false };
    case 'outline':
      return { bg: 'transparent', fg: tokens.accentInk, border: tokens.accent, onFill: false };
    case 'ghost':
      return { bg: 'transparent', fg: tokens.accentInk, onFill: false };
    case 'danger':
      return { bg: tokens.danger, fg: onDanger(tokens), onFill: true };
    case 'highlight':
      return { bg: tokens.highlight, fg: tokens.onHighlight, onFill: false };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  haptic,
  style,
  testID,
}: ButtonProps) {
  const { tokens } = useTheme();
  const look = buttonLook(variant, tokens);
  const inert = disabled || loading;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: loading }}
      onPress={inert ? undefined : onPress}
      disabled={inert}
      haptic={haptic}
      ripple={look.onFill ? 'onFill' : 'default'}
      testID={testID}
      style={[
        styles.base,
        {
          height: BUTTON_HEIGHT[size],
          paddingHorizontal: PAD_X[size],
          backgroundColor: look.bg,
          borderColor: look.border ?? 'transparent',
          borderWidth: look.border ? 1.5 : 0,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          // A loading button keeps its colour (it is working, not off); a disabled one fades.
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <View style={[styles.row, loading && styles.hidden]}>
        {icon ? <Ionicons name={icon} size={ICON[size]} color={look.fg} /> : null}
        <Text variant={LABEL_VARIANT[size]} color={look.fg} numberOfLines={1} chrome>
          {label}
        </Text>
      </View>
      {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} color={look.fg} /> : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.button,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hidden: {
    opacity: 0,
  },
});
