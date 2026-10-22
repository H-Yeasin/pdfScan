import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useT } from '../../i18n/useT';
import { ICON_SIZE, ICONS, radii, spacing, useTheme, type IoniconName } from '../../theme';
import { badgeText } from './Badge';
import { Text } from './Text';
import { Touchable } from './Touchable';

// §17 U2: chips. `Chip` is an action or an applied value (a course on a document, a picked tag) and
// can carry a × to remove it. `FilterChip` is one of a row of filters: selected draws filled with a
// check, so the state never rests on colour alone, and TalkBack says "selected". Both are 36 dp pills
// (48 dp to touch). They replace the five chip components as their screens are redone (U5-U11).

export const CHIP_HEIGHT = 36;

type BaseChipProps = {
  label: string;
  icon?: IoniconName;
  // A number after the label ("Notes 12").
  count?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type ChipProps = BaseChipProps & {
  onPress?: () => void;
  // Draws a × that removes the chip; it is its own button ("Remove Physics").
  onRemove?: () => void;
};

export type FilterChipProps = BaseChipProps & {
  selected: boolean;
  onPress: () => void;
};

function ChipLabel({ label, count, color }: { label: string; count?: number; color: string }) {
  return (
    <Text variant="label" color={color} numberOfLines={1} chrome>
      {label}
      {count !== undefined ? <Text variant="label" weight="regular" color={color} chrome>{` ${badgeText(count)}`}</Text> : null}
    </Text>
  );
}

export function Chip({ label, icon, count, onPress, onRemove, disabled = false, accessibilityLabel, style, testID }: ChipProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const box = [styles.chip, { borderColor: tokens.edge, backgroundColor: tokens.surface }, onRemove && styles.withRemove, disabled && styles.disabled, style];
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={ICON_SIZE.inline} color={tokens.accentInk} /> : null}
      <ChipLabel label={label} count={count} color={tokens.ink} />
    </>
  );

  return (
    <View style={box} testID={testID}>
      {onPress ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          disabled={disabled}
          scale={false}
          style={styles.inner}
        >
          {content}
        </Touchable>
      ) : (
        <View style={styles.inner} accessible accessibilityLabel={accessibilityLabel}>
          {content}
        </View>
      )}
      {onRemove ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={t('ui.removeChip', { name: label })}
          onPress={onRemove}
          disabled={disabled}
          rippleRadius={CHIP_HEIGHT / 2}
          style={styles.remove}
        >
          <Ionicons name={ICONS.close} size={ICON_SIZE.inline} color={tokens.muted} />
        </Touchable>
      ) : null}
    </View>
  );
}

export function FilterChip({ label, icon, count, selected, onPress, disabled = false, accessibilityLabel, style, testID }: FilterChipProps) {
  const { tokens } = useTheme();
  const fg = selected ? tokens.accentInk : tokens.ink;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      scale={false}
      testID={testID}
      style={[
        styles.chip,
        styles.inner,
        selected ? { backgroundColor: tokens.accentSoft, borderColor: tokens.accent } : { backgroundColor: tokens.surface, borderColor: tokens.edge },
        disabled && styles.disabled,
        style,
      ]}
    >
      {selected ? (
        <Ionicons name={ICONS.done} size={ICON_SIZE.inline} color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={ICON_SIZE.inline} color={tokens.muted} />
      ) : null}
      <ChipLabel label={label} count={count} color={fg} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: CHIP_HEIGHT,
    borderRadius: radii.chip,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  inner: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md + 2,
  },
  withRemove: {
    paddingRight: 0,
  },
  remove: {
    width: CHIP_HEIGHT,
    height: CHIP_HEIGHT,
    marginLeft: -spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
});
