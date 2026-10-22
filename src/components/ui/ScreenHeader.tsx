import { useMemo, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import { ICONS, spacing, typeScale, useTheme, type IoniconName } from '../../theme';
import { IconButton } from './IconButton';
import { Text, maxScaleFor } from './Text';

// §17 U2: the top of every screen. It draws the top safe-area inset itself (each screen used to),
// a back button when given `back`, the title (and a subtitle), and up to three icon actions.
// U3's Menu is not built yet: `onMore` draws a ⋯ as one of the three, and its handler opens
// whatever the screen has; past three, the extra actions are dropped (with a warning in dev).
//
// `large`: a Caprasimo headline under the bar that folds into it as the content scrolls up. The
// screen gets the scroll from useScreenHeader():
//
//   const header = useScreenHeader({ subtitle: true });
//   <ScreenHeader large scroll={header} title=… subtitle=… />
//   <Animated.ScrollView onScroll={header.onScroll} scrollEventThrottle={16}
//     contentContainerStyle={{ paddingTop: header.contentTop }}>
//
// The header then floats over the content (absolute), so folding it never moves the content under
// the finger; the content starts below it through contentTop. Without `scroll` a large header is a
// still one in the layout. The fold follows the finger, so reduced motion leaves it as it is.

export type HeaderAction = {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  badge?: boolean | number;
  selected?: boolean;
  disabled?: boolean;
};

export type ScreenHeaderScroll = {
  scrollY: SharedValue<number>;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  // How far the content scrolls before the headline is folded away.
  collapse: number;
  // The content's top padding under a floating large header.
  contentTop: number;
};

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  back?: () => void;
  // §17 U9: a flow's first screen closes instead (Review's ×, which asks first).
  backIcon?: IoniconName;
  backLabel?: string;
  actions?: HeaderAction[];
  // After the actions: a screen's one text button ("Next"), which an icon can't say.
  trailing?: ReactNode;
  onMore?: () => void;
  moreLabel?: string;
  large?: boolean;
  scroll?: ScreenHeaderScroll;
  // false when something above already took the inset (a header inside a sheet).
  insetTop?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const HEADER_BAR_HEIGHT = 56;
export const MAX_HEADER_ACTIONS = 3;

// The large block: the headline (its line height at the font scale it can reach) and, if any, a
// caption under it, plus their padding. Pure, so useScreenHeader and the header agree.
export function largeTitleHeight(fontScale: number, withSubtitle: boolean): number {
  const headline = typeScale.headline.lineHeight * Math.min(fontScale, maxScaleFor('headline') ?? fontScale);
  const caption = withSubtitle ? typeScale.caption.lineHeight * fontScale + spacing.xs : 0;
  return Math.ceil(spacing.xs + headline + caption + spacing.md);
}

// The actions the bar shows: up to three, the ⋯ counted among them.
export function visibleActions(actions: HeaderAction[], hasMore: boolean): HeaderAction[] {
  const room = MAX_HEADER_ACTIONS - (hasMore ? 1 : 0);
  if (__DEV__ && actions.length > room) {
    console.warn(`ScreenHeader: ${actions.length} actions, room for ${room}; the rest go in the ⋯ menu (U3).`);
  }
  return actions.slice(0, room);
}

export function useScreenHeader(options: { subtitle?: boolean } = {}): ScreenHeaderScroll {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const collapse = largeTitleHeight(fontScale, !!options.subtitle);
  return useMemo(
    () => ({ scrollY, onScroll, collapse, contentTop: insets.top + HEADER_BAR_HEIGHT + collapse }),
    [scrollY, onScroll, collapse, insets.top]
  );
}

export function ScreenHeader({ title, subtitle, back, backIcon, backLabel, actions = [], trailing, onMore, moreLabel, large = false, scroll, insetTop = true, style }: ScreenHeaderProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const top = insetTop ? insets.top : 0;
  const shown = visibleActions(actions, !!onMore);
  const folding = large && !!scroll;

  const bar = (barTitle: ReactNode) => (
    <View style={[styles.bar, { backgroundColor: tokens.bg }, !back && styles.barNoBack]}>
      {back ? <IconButton icon={backIcon ?? ICONS.back} accessibilityLabel={backLabel ?? t('common.back')} onPress={back} /> : null}
      <View style={styles.titles}>{barTitle}</View>
      {shown.length || onMore ? (
        <View style={styles.actions}>
          {shown.map((a) => (
            <IconButton
              key={a.label}
              icon={a.icon}
              accessibilityLabel={a.label}
              onPress={a.onPress}
              badge={a.badge}
              selected={a.selected}
              disabled={a.disabled}
            />
          ))}
          {onMore ? <IconButton icon={ICONS.more} accessibilityLabel={moreLabel ?? t('a11y.moreActions')} onPress={onMore} /> : null}
        </View>
      ) : null}
      {trailing}
    </View>
  );

  const barTitles = (
    <>
      <Text variant="title" numberOfLines={1} chrome accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" color="muted" numberOfLines={1} chrome>
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  const largeBlock = (
    <>
      <Text variant="headline" numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" color="muted" numberOfLines={1} style={styles.largeSubtitle}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  if (!large) {
    return <View style={[{ paddingTop: top, backgroundColor: tokens.bg }, style]}>{bar(barTitles)}</View>;
  }
  if (!folding) {
    return (
      <View style={[{ paddingTop: top, backgroundColor: tokens.bg }, style]}>
        {bar(null)}
        <View style={styles.largeStill}>{largeBlock}</View>
      </View>
    );
  }
  return (
    <FoldingHeader scroll={scroll!} top={top} bg={tokens.bg} edge={tokens.edge} style={style} bar={bar} title={title} largeBlock={largeBlock} />
  );
}

type FoldingProps = {
  scroll: ScreenHeaderScroll;
  top: number;
  bg: string;
  edge: string;
  style?: StyleProp<ViewStyle>;
  bar: (barTitle: ReactNode) => ReactNode;
  title: string;
  largeBlock: ReactNode;
};

function FoldingHeader({ scroll, top, bg, edge, style, bar, title, largeBlock }: FoldingProps) {
  const { scrollY, collapse } = scroll;

  const boxStyle = useAnimatedStyle(() => ({
    height: top + HEADER_BAR_HEIGHT + collapse * (1 - interpolate(scrollY.value, [0, collapse], [0, 1], Extrapolation.CLAMP)),
  }));
  const largeStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [0, collapse], [0, 1], Extrapolation.CLAMP);
    return { opacity: 1 - p * 1.4, transform: [{ scale: 1 - p * 0.12 }] };
  });
  // The bar's small title comes in over the last third of the fold, as the headline goes.
  const barTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [collapse * 0.66, collapse], [0, 1], Extrapolation.CLAMP),
  }));
  const ruleStyle = useAnimatedStyle(() => ({ opacity: scrollY.value >= collapse ? 1 : 0 }));

  return (
    <Animated.View style={[styles.floating, { paddingTop: top, backgroundColor: bg }, boxStyle, style]}>
      <View style={styles.barLayer}>
        {bar(
          // The headline is the header for TalkBack; the bar's copy is only drawn.
          <Animated.View style={barTitleStyle} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text variant="title" numberOfLines={1} chrome>
              {title}
            </Text>
          </Animated.View>
        )}
      </View>
      <Animated.View style={[styles.largeFolding, largeStyle]}>{largeBlock}</Animated.View>
      <Animated.View style={[styles.rule, { backgroundColor: edge }, ruleStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: HEADER_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  barNoBack: {
    paddingLeft: spacing.lg,
  },
  titles: {
    flex: 1,
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  largeStill: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  largeSubtitle: {
    marginTop: spacing.xs,
  },
  floating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    overflow: 'hidden',
  },
  // Above the headline, which slides up under it.
  barLayer: {
    zIndex: 1,
  },
  largeFolding: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    transformOrigin: 'left bottom',
  },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
