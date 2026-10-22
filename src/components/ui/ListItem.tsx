import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { useT } from '../../i18n/useT';
import { ICON_SIZE, ICONS, MIN_TOUCH, radii, spacing, useTheme, type IoniconName } from '../../theme';
import { hapticSelection } from '../../services/feedback/haptics';
import { Text } from './Text';
import { Touchable } from './Touchable';

// §17 U2: one row of a list or a settings group. Leading: an icon in a soft circle, or any node (a
// thumbnail, an avatar). Then a title, an optional subtitle, a meta text (a date, a size) and a
// trailing chevron, ⋯, switch or node.
//
// Selection: when `selected` is a boolean (not undefined) the list is in selection mode and the row
// shows a checkbox in front of everything, so a selected row is visible without relying on a tint,
// and TalkBack says "checkbox, checked". A row with a switch is the switch (role "switch"), so one
// tap anywhere on it toggles.
//
// §17 U10: a row of a one-of-many choice passes `radioSelected` (a boolean): its role is "radio",
// and the chosen row carries a checkmark at the end.

// The leading icon's soft circle.
export const ICON_WELL = 36;

export type ListItemProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: IoniconName;
  // Overrides `icon` (a thumbnail, a course dot).
  leading?: ReactNode;
  trailing?: 'chevron' | 'more' | ReactNode;
  // A switch row: `switchValue` + `onValueChange`.
  switchValue?: boolean;
  onValueChange?: (value: boolean) => void;
  selected?: boolean;
  radioSelected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  // When `trailing` is 'more': the ⋯ opens a menu on its own, apart from the row's onPress.
  onMore?: () => void;
  moreLabel?: string;
  titleLines?: number;
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ListItem({
  title,
  subtitle,
  meta,
  icon,
  leading,
  trailing,
  switchValue,
  onValueChange,
  selected,
  radioSelected,
  onPress,
  onLongPress,
  onMore,
  moreLabel,
  titleLines = 1,
  danger = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ListItemProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const selecting = selected !== undefined;
  const isSwitch = switchValue !== undefined;
  const isRadio = radioSelected !== undefined;
  const ink = danger ? tokens.danger : tokens.ink;

  // §17 U13: a switch flipping is a selection tick (haptics.ts), from the row or the Switch.
  const flip = (value: boolean) => {
    hapticSelection();
    onValueChange?.(value);
  };
  const press = isSwitch && !onPress ? () => flip(!switchValue) : onPress;
  const role = selecting ? 'checkbox' : isSwitch ? 'switch' : isRadio ? 'radio' : press ? 'button' : 'text';
  const checked = selecting ? selected : isSwitch ? switchValue : isRadio ? radioSelected : undefined;

  const body = (
    <>
      {selecting ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={selected ? tokens.accent : tokens.muted}
          style={styles.check}
        />
      ) : null}
      {leading ??
        (icon ? (
          <View style={[styles.iconWell, { backgroundColor: danger ? tokens.surface2 : tokens.accentSoft }]}>
            <Ionicons name={icon} size={ICON_SIZE.row} color={danger ? tokens.danger : tokens.accentInk} />
          </View>
        ) : null)}
      <View style={styles.texts}>
        <Text variant="bodyStrong" color={ink} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text variant="caption" color="muted" numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      {isSwitch ? (
        // The row is the control; the Switch only shows the state.
        <Switch
          value={switchValue}
          onValueChange={flip}
          disabled={disabled}
          trackColor={{ true: tokens.accent, false: tokens.edge }}
          thumbColor={tokens.surface3}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : isRadio ? (
        <Ionicons name="checkmark" size={ICON_SIZE.row} color={radioSelected ? tokens.accent : 'transparent'} />
      ) : trailing === 'chevron' ? (
        <Ionicons name="chevron-forward" size={ICON_SIZE.row} color={tokens.muted} />
      ) : trailing === 'more' ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={moreLabel ?? t('a11y.moreActions')}
          onPress={onMore}
          disabled={!onMore || selecting}
          rippleRadius={MIN_TOUCH / 2}
          style={styles.more}
        >
          <Ionicons name={ICONS.more} size={ICON_SIZE.row} color={tokens.muted} />
        </Touchable>
      ) : (
        trailing
      )}
    </>
  );

  const rowStyle = [styles.row, selected && { backgroundColor: tokens.accentSoft }, disabled && styles.disabled, style];

  if (!press && !onLongPress) {
    return (
      <View style={rowStyle} accessible accessibilityRole={role} accessibilityLabel={accessibilityLabel} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Touchable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, checked }}
      onPress={press}
      onLongPress={onLongPress}
      disabled={disabled}
      scale={false}
      testID={testID}
      style={rowStyle}
    >
      {body}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  check: {
    marginRight: -spacing.xs,
  },
  iconWell: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  more: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    marginRight: -spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
});
