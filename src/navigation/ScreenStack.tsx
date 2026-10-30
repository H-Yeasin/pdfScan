import { memo, useLayoutEffect, useMemo, useState, type ComponentType } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { TabBar } from '../components/shared/TabBar';
import { useAppSelector } from '../store/AppStateContext';
import { useTheme } from '../theme';
import { useReducedMotion } from '../theme/useReducedMotion';
import type { ScreenName } from '../types/navigation';
import { activeStack, isRootEntry, rootEntry, TABS, topEntry, type TabId } from './navStack';
import { useRenderCount } from '../utils/renderCounts';
import { useRouter } from './router';
import { ScreenRoleContext, type ScreenRole } from './screenRole';
import { pickTransition, RESTING_STYLE, runSlide, settleStyle, transitionDuration, transitionStyle, type TransitionKind } from './transitions';

// §16 G2: draws the router's stacks as layers, each screen instance in its own keyed layer, so a
// navigation never mounts a screen twice:
// - the shell: every visited tab's root (mounted on its first visit, then kept) above the one
//   tab bar. It's shown while a root is on top;
// - the active tab's pushed screens above it, all kept mounted under the top one (up to
//   navStack.MAX_PUSHED), so Back finds each where it was left: scrolled, filtered, loaded;
// - during a transition, the screen that was on top, until it has slid or faded away. A popped
//   screen unmounts then.
//
// Layers that aren't shown are `display: 'none'`. React 19.2's <Activity mode="hidden"> was the
// first idea (the plan's), but it unmounts a hidden screen's effects and runs them again when it
// shows, and screens here reset state in effects: the Reader's per-file reset (useReaderDocument,
// keyed on the file) would zero its page count under a PDF that's still open, after only a detour
// to Pro. So hidden screens keep running, and what must only happen on screen asks
// useScreenRole(). On Android, Fabric keeps a `display: 'none'` view's native children (it makes
// it INVISIBLE and doesn't lay its subtree out again, ReactNativeFeatureFlags
// useTraitHiddenOnAndroid being off), so scroll positions and a loaded banner survive. iOS drops
// them until shown again.

// §9 O6: on a tablet, content stays at a readable width, centred, instead of stretching across the
// screen. Review's page editor and the Reader use the whole screen.
const CONTENT_MAX_WIDTH = 720;
const FULL_BLEED: ReadonlySet<ScreenName> = new Set(['review', 'reader']);

export type ScreenMap = Record<ScreenName, ComponentType>;

// Memoised, with stable props, so a layer changing role or style doesn't re-render its screen.
const ScreenFrame = memo(function ScreenFrame({ Screen, fullBleed, background }: { Screen: ComponentType; fullBleed: boolean; background: string }) {
  if (fullBleed) return <Screen />;
  return (
    <View style={[styles.frame, { backgroundColor: background }]}>
      <View style={styles.content}>
        <Screen />
      </View>
    </View>
  );
});

type LayerProps = { Screen: ComponentType; fullBleed: boolean; role: ScreenRole; style: object | undefined; background: string };

const ScreenLayer = memo(function ScreenLayer({ Screen, fullBleed, role, style, background }: LayerProps) {
  return (
    <ScreenRoleContext.Provider value={role}>
      <Animated.View pointerEvents={role === 'active' ? 'auto' : 'none'} style={[styles.layer, RESTING_STYLE, style, role === 'hidden' ? styles.hidden : null]}>
        <ScreenFrame Screen={Screen} fullBleed={fullBleed} background={background} />
      </Animated.View>
    </ScreenRoleContext.Provider>
  );
});

export function ScreenStack({ screens }: { screens: ScreenMap }) {
  useRenderCount('ScreenStack');
  const { nav, transition, navTick } = useRouter();
  const { tokens } = useTheme();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  // Library's selection bar takes the tab bar's place.
  const selecting = useAppSelector((s) => s.libraryUi.selMode);

  // A new value for each transition, at 0, so its first frame already draws both layers where they
  // start, and never written once its transition has ended. On Android, RN 0.86 keeps every value
  // the native driver writes to a view and puts it over whatever React sends for transform and
  // opacity afterwards, until the view is deleted (SurfaceMountingManager's synchronous mount props
  // override). One shared value reset to 0 after each transition did just that: a layer's animated
  // node is disconnected in a microtask after the commit, and a commit that also carries a store
  // update (useSyncExternalStore, so Sync lane) runs its effects before that, so the reset reached
  // a layer still connected and moved it back to where it started, for good. Skip on onboarding,
  // with its burst of store updates, left Home's shell a screen's width off to the right.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const progress = useMemo(() => new Animated.Value(0), [navTick]);
  const [settledTick, setSettledTick] = useState(navTick);
  const animating = transition.kind !== 'none' && navTick !== settledTick;
  const top = topEntry(nav);
  // §17 U13: push, tab, modal, or a plain fade under reduced motion.
  const kind: TransitionKind | null =
    transition.kind === 'none' || !transition.from ? null : pickTransition(transition.kind, transition.from.screen, top.screen, transition.dir, reducedMotion);
  useLayoutEffect(() => {
    if (!animating || !kind) return;
    const tick = navTick;
    runSlide(progress, () => setSettledTick((s) => Math.max(s, tick)), transitionDuration(kind));
    // A new transition (navTick) starts a new animation; an interrupted one just stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTick]);

  const leaving = animating ? transition.from : null;
  const topIsRoot = isRootEntry(top);
  const leavingIsRoot = leaving !== null && isRootEntry(leaving);
  const roleOf = (key: string): ScreenRole => (key === top.key ? 'active' : key === leaving?.key ? 'outgoing' : 'hidden');
  const shellRole: ScreenRole = topIsRoot ? 'active' : leavingIsRoot ? 'outgoing' : 'hidden';

  // Roots mount on their first visit and stay.
  const [visited, setVisited] = useState<readonly TabId[]>(() => (topIsRoot ? [nav.tab] : []));
  if (topIsRoot && !visited.includes(nav.tab)) setVisited([...visited, nav.tab]);

  // Which layers move. Root to root (a tab switch): the two roots, inside a shell that stays put
  // with its tab bar. Otherwise the outer layers, the shell standing in for whichever side is a
  // root. Built once per transition so the memoised layers keep their props. A root revealed with
  // the shell standing in also gets settleStyle: its view may still hold the opacity 0 of the tab
  // switch it last left by, which only a native write clears (see there).
  const motion = useMemo(() => {
    const byKey: Record<string, object | undefined> = {};
    let shell: object | undefined;
    if (!leaving || !kind) return { byKey, shell };
    const style = (layer: 'incoming' | 'outgoing') => transitionStyle(progress, { width, height }, layer, transition.dir, kind);
    if (topIsRoot && leavingIsRoot) {
      byKey[top.key] = style('incoming');
      byKey[leaving.key] = style('outgoing');
    } else {
      if (topIsRoot) {
        shell = style('incoming');
        byKey[top.key] = settleStyle(progress);
      } else byKey[top.key] = style('incoming');
      if (leavingIsRoot) shell = style('outgoing');
      else byKey[leaving.key] = style('outgoing');
    }
    return { byKey, shell };
  }, [leaving, transition, kind, top.key, topIsRoot, leavingIsRoot, progress, width, height]);

  const pushed = activeStack(nav).filter((entry) => !isRootEntry(entry));
  if (leaving && !leavingIsRoot && !pushed.some((entry) => entry.key === leaving.key)) pushed.push(leaving);

  return (
    <View style={styles.stage}>
      <ScreenRoleContext.Provider value={shellRole}>
        <Animated.View
          pointerEvents={shellRole === 'active' ? 'auto' : 'none'}
          style={[styles.layer, RESTING_STYLE, motion.shell, shellRole === 'hidden' ? styles.hidden : null]}
        >
          <View style={[styles.shell, { backgroundColor: tokens.bg }]}>
            <View style={styles.roots}>
              {TABS.filter((tab) => visited.includes(tab)).map((tab) => {
                const { key } = rootEntry(tab);
                return (
                  <ScreenLayer
                    key={key}
                    Screen={screens[tab]}
                    fullBleed={FULL_BLEED.has(tab)}
                    role={roleOf(key)}
                    style={motion.byKey[key]}
                    background={tokens.bg}
                  />
                );
              })}
            </View>
            {selecting && nav.tab === 'library' ? null : <TabBar />}
          </View>
        </Animated.View>
      </ScreenRoleContext.Provider>
      {pushed.map((entry) => (
        <ScreenLayer
          key={entry.key}
          Screen={screens[entry.screen]}
          fullBleed={FULL_BLEED.has(entry.screen)}
          role={roleOf(entry.key)}
          style={motion.byKey[entry.key]}
          background={tokens.bg}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: StyleSheet.absoluteFill,
  layer: StyleSheet.absoluteFill,
  hidden: { display: 'none' },
  shell: { flex: 1 },
  roots: { flex: 1 },
  frame: { flex: 1, alignItems: 'center' },
  content: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH },
});
