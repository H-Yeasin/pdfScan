import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';
import { t as translate } from '../../i18n';
import { useT } from '../../i18n/useT';
import { useRouter } from '../../navigation/router';
import { ICON_SIZE, ICONS, radii, spacing, useTheme } from '../../theme';
import { Text, Touchable } from '../ui';
import { passLeftLabel, useProPassState } from './ProPassCard';

// The launcher icon's foreground: the mark without its tile, with its own shadow, in the middle of a
// 512 px square (the rest is the adaptive icon's padding, fully transparent). The owner's choice for
// the app bar over BrandMark's tile.
const MARK = require('../../../assets/android-icon-foreground.png') as number;

// The box the mark is shown in: the middle half of the PNG (px 128–384), which holds the mark and
// all but the faintest edge of its shadow, so the mark is about 32 dp tall.
const LOGO = 40;

// "42m", "1h 20m", "2h": the time left as the exponent. An exponent has room for a few characters,
// so it drops the spaces and "left" that passLeftLabel keeps; TalkBack hears the long form.
export function passShortLabel(minutes: number): string {
  if (minutes < 60) return translate('home.passShortMinutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? translate('home.passShortHours', { hours }) : translate('home.passShortHoursMinutes', { hours, minutes: rest });
}

// Home's Pro pass, in the app bar to the right of the greeting: the app icon's mark with the Pro
// diamond at its top-right like an exponent, and the time left at its bottom-left (diamond and time
// marigold while a pass runs; without one the diamond is grey and the time a plus, one tap from the
// Pro screen's "Watch an ad"). Same states as Me's ProPassCard (useProPassState): nothing for a paid
// licence, or with ads off and no pass running.
export function ProPassBadge() {
  const { t } = useT();
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, passHours } = useProPassState();
  if (!state) return null;

  const active = state.kind === 'active';
  // Ringed in the page colour, so each reads as cut out of the corner of the mark it sits on.
  const ring = { borderColor: tokens.bg };
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={active ? t('home.passActive', { left: passLeftLabel(state.minutes) }) : t('home.getPass', { count: passHours })}
      onPress={() => go('pro')}
      rippleRadius={LOGO}
      style={styles.badge}
      testID={active ? 'home-pro-active' : 'home-pro-offer'}
    >
      {/* The button's label says it all: TalkBack doesn't also read the logo, the diamond and the time. */}
      <View style={styles.badge} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.bubble, styles.time, ring, { backgroundColor: tokens.highlight }]}>
          {active ? (
            <Text variant="caption" weight="bold" color="onHighlight" chrome numberOfLines={1} style={styles.timeText}>
              {passShortLabel(state.minutes)}
            </Text>
          ) : (
            <Ionicons name="add" size={ICON_SIZE.inline} color={tokens.onHighlight} />
          )}
        </View>
        <View style={styles.crop}>
          <Image source={MARK} style={styles.mark} />
        </View>
        <View style={[styles.bubble, styles.diamond, ring, { backgroundColor: active ? tokens.highlight : tokens.surface2 }]}>
          <Ionicons name={ICONS.pro} size={DIAMOND} color={active ? tokens.onHighlight : tokens.muted} />
        </View>
      </View>
    </Touchable>
  );
}

// The mark's transparent margin in its box: 44 px of the PNG's middle 256 at each side, 25 at the
// top and bottom (7 dp and 4 dp at 40).
const INSET_X = Math.round((LOGO * 44) / 256);
const INSET_Y = Math.round((LOGO * 25) / 256);
// The time and diamond bubbles' height, and how far each reaches over the mark's corner.
const BUBBLE = 20;
const OVERLAP = spacing.xs;
// The diamond inside its bubble (16 dp inside the ring).
const DIAMOND = 12;

const styles = StyleSheet.create({
  // Time, mark, diamond in a row. The mark's margin leaves the bubbles room to stand past it: the
  // diamond's centre on the mark's top edge (a power above its base), the time's on its bottom edge.
  badge: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  crop: {
    width: LOGO,
    height: LOGO,
    marginVertical: BUBBLE / 2 - INSET_Y,
    overflow: 'hidden',
  },
  // The whole PNG at twice the box, moved up and left by a quarter, leaves its middle half in view.
  mark: {
    position: 'absolute',
    left: -LOGO / 2,
    top: -LOGO / 2,
    width: LOGO * 2,
    height: LOGO * 2,
  },
  bubble: {
    minWidth: BUBBLE,
    minHeight: BUBBLE,
    borderRadius: radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Drawn over the mark's corner, not under it.
    zIndex: 1,
  },
  time: {
    alignSelf: 'flex-end',
    marginRight: -(INSET_X + OVERLAP),
    paddingHorizontal: spacing.xs + 1,
  },
  diamond: {
    alignSelf: 'flex-start',
    marginLeft: -(INSET_X + OVERLAP),
  },
  timeText: {
    lineHeight: 16,
  },
});
