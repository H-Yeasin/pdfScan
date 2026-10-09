import { Canvas, Group, type SkPoint, type Transforms3d } from '@shopify/react-native-skia';
import * as Linking from 'expo-linking';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, StyleSheet, useColorScheme, type LayoutChangeEvent } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { releaseSplash, SPLASH_TIMEOUT_MS } from '../../bootstrap/splash';
import {
  EXIT_SCALE,
  foldTransform,
  INTRO_EXIT_MS,
  INTRO_PHASES,
  INTRO_TOTAL_MS,
  introFrame,
  introPlan,
  PIECE_DIRECTIONS,
  pieceTransform,
  shouldExit,
  STILL_EXIT_MS,
  sweepLine,
  takeFirstMount,
  WORDMARK_RISE_DP,
  type IntroFrame,
  type IntroPlan,
} from '../../bootstrap/splashIntro';
import { useT } from '../../i18n/useT';
import { isFileUri } from '../../store/useExternalFileLinking';
import { CHROME_MAX_FONT_SCALE, spacing, SPLASH_TILE_DP, tokens, typeScale, type ThemeName } from '../../theme';
import { BrandTile } from './BrandMark';
import { IntroMark } from './IntroMark';
import { TILE_SIZE } from './markGeometry';

// §15 V5: the splash intro, "Scan & assemble". The timeline, the rules and the frame maths are in
// bootstrap/splashIntro.ts; this draws them.
//
// The handoff: on Android the app can't draw while the native splash is held, and the splash always
// fades out over the app's first frame. So this overlay's first frame is the native splash itself:
// the system theme's bg (useColorScheme(), not the app's setting, because the native splash follows
// the system) with the logo tile SPLASH_TILE_DP wide in the middle of the edge-to-edge window, drawn
// with BrandTile, which matches the splash PNGs. Once that frame is laid out it releases the native
// splash, which fades out over it for SPLASH_EXIT_MS while the overlay holds still. Then the intro
// plays over the app, which keeps booting underneath, and fades into the start screen.
//
// One Reanimated clock (ms since the release) drives every moving prop through introFrame(); a skip
// just moves the clock to the end. The overlay is one button: a tap, or Back, skips to the final
// frame, and it leaves once boot is done.

const TILE_HEIGHT = (SPLASH_TILE_DP * TILE_SIZE.height) / TILE_SIZE.width;
const WORDMARK_GAP = spacing.sm;

// IntroMark (the drawing) fed from the clock's frame: each moving part a value derived on the UI
// thread with the same worklets introMarkProps() uses for a still frame.
function AnimatedIntroMark({ frame }: { frame: SharedValue<IntroFrame> }) {
  const stemTop = useDerivedValue<Transforms3d>(() => pieceTransform(PIECE_DIRECTIONS.stemTop, frame.value.part));
  const topBar = useDerivedValue<Transforms3d>(() => pieceTransform(PIECE_DIRECTIONS.topBar, frame.value.part));
  const bowl = useDerivedValue<Transforms3d>(() => pieceTransform(PIECE_DIRECTIONS.bowl, frame.value.part));
  const stemBottom = useDerivedValue<Transforms3d>(() => pieceTransform(PIECE_DIRECTIONS.stemBottom, frame.value.part));
  const fold = useDerivedValue<Transforms3d>(() => foldTransform(frame.value.fold));
  const bandStart = useDerivedValue<SkPoint>(() => sweepLine(frame.value.sweep).start);
  const bandEnd = useDerivedValue<SkPoint>(() => sweepLine(frame.value.sweep).end);
  return <IntroMark pieces={{ stemTop, topBar, bowl, stemBottom }} fold={fold} bandStart={bandStart} bandEnd={bandEnd} />;
}

type Props = {
  booting: boolean;
  // settings.appLock.enabled: the lock prompt opens as soon as boot is done.
  appLocked: boolean;
};

export function SplashIntro({ booting, appLocked }: Props) {
  const { t } = useT();
  const theme: ThemeName = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = tokens[theme];
  const [firstMount] = useState(takeFirstMount);
  const mountedAt = useRef(Date.now());
  const releasedAt = useRef(0);
  const skipped = useRef(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>();
  const [externalLaunch, setExternalLaunch] = useState<boolean>();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [released, setReleased] = useState(false);
  const [holdOver, setHoldOver] = useState(false);
  const [capReached, setCapReached] = useState(false);
  const [plan, setPlan] = useState<IntroPlan>('wait');
  const [introDone, setIntroDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);
  const [wordmarkHeight, setWordmarkHeight] = useState(0);
  const clock = useSharedValue(0);
  const exit = useSharedValue(0);

  // The inputs that arrive late, asked for at mount: they have the whole native splash to answer.
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => live && setReducedMotion(on))
      .catch(() => {});
    Linking.getInitialURL()
      .then((url) => live && setExternalLaunch(url ? isFileUri(url) : false))
      .catch(() => {});
    const cap = setTimeout(() => setCapReached(true), SPLASH_TIMEOUT_MS);
    return () => {
      live = false;
      clearTimeout(cap);
    };
  }, []);

  // Laid out: one frame later the still frame is on screen, so the native splash can go.
  useEffect(() => {
    if (!size || released) return;
    const id = requestAnimationFrame(() => {
      releasedAt.current = Date.now();
      releaseSplash();
      setReleased(true);
    });
    return () => cancelAnimationFrame(id);
  }, [size, released]);

  useEffect(() => {
    if (!released) return;
    const id = setTimeout(() => setHoldOver(true), INTRO_PHASES.hold.end);
    return () => clearTimeout(id);
  }, [released]);

  // The plan is decided once and kept.
  useEffect(() => {
    if (plan !== 'wait') return;
    const next = introPlan({ reducedMotion, externalLaunch, firstMountThisProcess: firstMount, holdOver });
    if (next !== 'wait') setPlan(next);
  }, [plan, reducedMotion, externalLaunch, firstMount, holdOver]);

  // The clock runs from the release; nothing moves before the hold ends, so a plan decided during
  // the hold starts the clock where it would have been.
  useEffect(() => {
    // A skip before the release (the native splash still up) must not start it again.
    if (!released || plan === 'wait' || skipped.current) return;
    if (plan === 'still') {
      setIntroDone(true);
      return;
    }
    const from = Math.min(INTRO_TOTAL_MS, Date.now() - releasedAt.current);
    clock.value = from;
    clock.value = withTiming(INTRO_TOTAL_MS, { duration: INTRO_TOTAL_MS - from, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(setIntroDone)(true);
    });
  }, [released, plan, clock]);

  // Jumps to the final frame. True when there was something to skip (Back is then used up).
  const skip = useCallback(() => {
    if (introDone) return false;
    skipped.current = true;
    if (plan === 'play') {
      cancelAnimation(clock);
      clock.value = INTRO_TOTAL_MS;
    } else {
      setPlan('still');
    }
    setIntroDone(true);
    return true;
  }, [introDone, plan, clock]);

  // Added once the splash is released, so it's newer than AppNavigator's listener (registered when
  // AppNavigator mounted) and runs first.
  useEffect(() => {
    if (!released || exiting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', skip);
    return () => sub.remove();
  }, [released, exiting, skip]);

  // The exit waits for the hold (the native splash's fade), except at the cap; then it starts one
  // frame later, so the start screen has drawn underneath.
  const exitNow =
    !exiting && (holdOver || capReached) && shouldExit({ introDone, booting, appLocked, elapsedMs: capReached ? SPLASH_TIMEOUT_MS : Date.now() - mountedAt.current });
  useEffect(() => {
    if (!exitNow) return;
    const id = requestAnimationFrame(() => {
      setExiting(true);
      exit.value = withTiming(1, { duration: plan === 'play' ? INTRO_EXIT_MS : STILL_EXIT_MS }, (finished) => {
        if (finished) runOnJS(setGone)(true);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [exitNow, plan, exit]);

  const frame = useDerivedValue(() => introFrame(clock.value));
  // The tile moves up by half the wordmark's height (and gap) as it comes in, so the pair stays
  // centred; after a played intro it also grows a little as the overlay fades.
  const lift = (WORDMARK_GAP + wordmarkHeight) / 2;
  const exitScale = plan === 'play' ? EXIT_SCALE : 1;
  const tileTransform = useDerivedValue<Transforms3d>(() => [{ translateY: -lift * frame.value.wordmark }, { scale: 1 + (exitScale - 1) * exit.value }]);
  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: frame.value.wordmark,
    transform: [{ translateY: WORDMARK_RISE_DP * (1 - frame.value.wordmark) - lift * frame.value.wordmark }],
  }));

  if (gone) return null;
  const cx = (size?.width ?? 0) / 2;
  const cy = (size?.height ?? 0) / 2;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, overlayStyle]}
      pointerEvents={exiting ? 'none' : 'auto'}
      onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityRole="button" accessibilityLabel={t('brand.skipIntro')}>
        {size ? (
          <>
            <Canvas style={StyleSheet.absoluteFill}>
              <Group origin={{ x: cx, y: cy }} transform={tileTransform}>
                <BrandTile x={cx - SPLASH_TILE_DP / 2} y={cy - TILE_HEIGHT / 2} width={SPLASH_TILE_DP} theme={theme} mark={<AnimatedIntroMark frame={frame} />} />
              </Group>
            </Canvas>
            <Animated.Text
              style={[typeScale.title, styles.wordmark, { top: cy + TILE_HEIGHT / 2 + WORDMARK_GAP, color: colors.ink }, wordmarkStyle]}
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
              onLayout={(e: LayoutChangeEvent) => setWordmarkHeight(e.nativeEvent.layout.height)}
            >
              {t('brand.name')}
            </Animated.Text>
          </>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// A drawing error (an old dev build without Skia, say) must never take the app down: the overlay
// goes, and the native splash is released so the app shows.
export class SplashIntroBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    releaseSplash();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const styles = StyleSheet.create({
  wordmark: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
});
