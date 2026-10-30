import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';
import { t as translate } from '../../i18n';
import { useT } from '../../i18n/useT';
import { useRouter } from '../../navigation/router';
import { ICON_SIZE, radii, spacing, useTheme } from '../../theme';
import { Badge, Text, Touchable } from '../ui';
import { passLeftLabel, useProPassState } from './ProPassCard';

// The launcher icon's foreground: the mark without its tile, with its own shadow, in the middle of a
// 512 px square (the rest is the adaptive icon's padding, fully transparent). The owner's choice for
// the app bar over BrandMark's tile.
const MARK = require('../../../assets/android-icon-foreground.png') as number;

// The box the mark is shown in: the middle half of the PNG (px 128–384), which holds the mark and
// all but the faintest edge of its shadow, so the mark is about 32 dp tall.
const LOGO = 38;

// "42m", "1h 20m", "2h": the time left as the exponent. An exponent has room for a few characters,
// so it drops the spaces and "left" that passLeftLabel keeps; TalkBack hears the long form.
export function passShortLabel(minutes: number): string {
  if (minutes < 60) return translate('home.passShortMinutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? translate('home.passShortHours', { hours }) : translate('home.passShortHoursMinutes', { hours, minutes: rest });
}

// Home's Pro pass, in the app bar to the right of the greeting: the app icon's mark, marked "Pro",
// with the time left at its top-right like an exponent (logo^42m). Without a pass the "Pro" is grey
// and the exponent a plus, one tap from the Pro screen's "Watch an ad". Same states as Me's
// ProPassCard (useProPassState): nothing for a paid licence, or with ads off and no pass running.
export function ProPassBadge() {
  const { t } = useT();
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, passHours } = useProPassState();
  if (!state) return null;

  const active = state.kind === 'active';
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={active ? t('home.passActive', { left: passLeftLabel(state.minutes) }) : t('home.getPass', { count: passHours })}
      onPress={() => go('pro')}
      rippleRadius={LOGO}
      style={styles.badge}
      testID={active ? 'home-pro-active' : 'home-pro-offer'}
    >
      {/* The button's label says it all: TalkBack doesn't also read "PDF Scan logo" and "Pro". */}
      <View style={styles.badge} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.logo}>
          <View style={styles.crop}>
            <Image source={MARK} style={styles.mark} />
          </View>
          <Badge kind="pro" tone={active ? 'highlight' : 'neutral'} style={styles.proMark} />
        </View>
        {/* Ringed in the page colour, so it stays apart from the fold's corner it sits against. */}
        <View style={[styles.power, { backgroundColor: tokens.highlight, borderColor: tokens.bg }]}>
          {active ? (
            <Text variant="caption" weight="bold" color="onHighlight" chrome numberOfLines={1} style={styles.powerText}>
              {passShortLabel(state.minutes)}
            </Text>
          ) : (
            <Ionicons name="add" size={ICON_SIZE.inline} color={tokens.onHighlight} />
          )}
        </View>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  // The exponent sits above the logo's top edge, the way a power sits above its base.
  badge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // The box already has ~4 dp of transparent space over the mark.
  logo: {
    paddingTop: spacing.xs,
    alignItems: 'center',
  },
  crop: {
    width: LOGO,
    height: LOGO,
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
  // Over the logo's bottom edge, like a ribbon.
  proMark: {
    alignSelf: 'center',
    marginTop: -spacing.sm,
  },
  power: {
    marginLeft: -spacing.sm,
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: spacing.xs + 1,
    borderRadius: radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerText: {
    lineHeight: 16,
  },
});
