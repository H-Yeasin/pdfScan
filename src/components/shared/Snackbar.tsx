import { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import type { Snack, TaskToast } from '../../store/slices/uiSlice';
import { durations, elevation, radii, spacing, springs, useMotion, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { announce } from '../../services/a11y/announce';
import { hapticLight } from '../../services/feedback/haptics';
import { Button, ProgressBar, Text } from '../ui';
import { useBottomBarHeight } from './bottomBarHeight';

const AUTO_DISMISS_MS = 3200;
// §17 U13: how far a snack must be dragged sideways, or how fast flung, to go.
const SWIPE_DISTANCE = 80;
const SWIPE_VELOCITY = 800;

// §17 U13: each message rises into place and sinks away; the next one in the queue (§9 O6) rises as
// the last one sinks. Both land at once under reduced motion.
const enter = FadeInDown.duration(durations.base).reduceMotion(ReduceMotion.System);
const leave = FadeOutDown.duration(durations.fast).reduceMotion(ReduceMotion.System);

// One bar at the root of the app: the snack (state.ui.snack), or while a long job runs, its toast
// (state.ui.task, components/ui/useTask), which then gives way to the result snack.
export function Snackbar() {
  const dispatch = useAppDispatch();
  const snack = useAppSelector((s) => s.ui.snack);
  const task = useAppSelector((s) => s.ui.task);
  const insets = useSafeAreaInsets();
  // §14 Q4: above the screen's bottom bar (tab bar, selection bar, Reader tools) when there is one,
  // otherwise above the navigation bar. The bar's height already includes the inset.
  const barHeight = useBottomBarHeight();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A key per message, so a new one (even with the same text) enters afresh.
  const keys = useRef(new WeakMap<object, number>());
  const nextKey = useRef(0);

  // A snack's clock starts when it is on screen, not while a task's toast covers it.
  useEffect(() => {
    if (!snack || task) return;
    announce(snack.msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dispatch({ type: 'ui/CLEAR_SNACK' }), AUTO_DISMISS_MS);
    return () => clearTimeout(timer.current);
  }, [snack, task, dispatch]);

  useEffect(() => {
    if (task) announce(task.label);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown: object | null = task ?? snack;
  if (!shown) return null;
  if (!keys.current.has(shown)) keys.current.set(shown, (nextKey.current += 1));
  // A task's progress makes a new object; it keeps its key by id.
  const key = task ? `task:${task.id}` : `snack:${keys.current.get(shown)}`;

  return (
    <View style={[styles.container, { bottom: barHeight > 0 ? barHeight + spacing.sm : Math.max(insets.bottom, spacing.md) + spacing.sm }]} pointerEvents="box-none">
      {task ? <TaskBar key={key} task={task} /> : <SnackBar key={key} snack={snack!} onDismiss={() => dispatch({ type: 'ui/CLEAR_SNACK' })} />}
    </View>
  );
}

// §17 U13: a floating bar (elevation 2's shadow) on the raised surface, ink text and an accent
// action, from the theme instead of a fixed dark bar: the pairs contrast.test.ts checks.
function useBarStyle() {
  const { theme, tokens } = useTheme();
  return [styles.bar, elevation(2, theme), { backgroundColor: tokens.surface3, borderColor: tokens.edge }];
}

function SnackBar({ snack, onDismiss }: { snack: NonNullable<Snack>; onDismiss: () => void }) {
  const { t } = useT();
  const motion = useMotion();
  const { width } = useWindowDimensions();
  const offset = useSharedValue(0);
  const barStyle = useBarStyle();

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      offset.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_DISTANCE || Math.abs(e.velocityX) > SWIPE_VELOCITY) {
        const to = Math.sign(e.translationX || e.velocityX) * width;
        runOnJS(hapticLight)();
        if (motion.reduced) {
          runOnJS(onDismiss)();
          return;
        }
        offset.value = withTiming(to, { duration: durations.fast }, () => runOnJS(onDismiss)());
      } else {
        offset.value = motion.reduced ? 0 : withSpring(0, springs.press);
      }
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
    opacity: 1 - Math.min(0.6, Math.abs(offset.value) / (width || 1)),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        entering={enter}
        exiting={leave}
        style={[barStyle, dragStyle]}
        accessibilityLiveRegion="polite"
        accessibilityActions={[{ name: 'dismiss', label: t('ui.dismiss') }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'dismiss') onDismiss();
        }}
      >
        <Text variant="body" style={styles.message} numberOfLines={2}>
          {snack.msg}
        </Text>
        {snack.action ? (
          <Button
            label={snack.action}
            variant="ghost"
            size="sm"
            onPress={() => {
              snack.onAction?.();
              onDismiss();
            }}
          />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

function TaskBar({ task }: { task: TaskToast }) {
  const { t } = useT();
  const barStyle = useBarStyle();
  const counting = task.total !== undefined && task.total > 1;
  return (
    <Animated.View entering={enter} exiting={leave} style={[barStyle, styles.task]}>
      <View style={styles.taskRow}>
        <Text variant="body" style={styles.message} numberOfLines={1}>
          {counting ? `${task.label} ${t('ui.task.count', { done: task.done ?? 0, total: task.total! })}` : task.label}
        </Text>
        {task.onCancel ? <Button label={t('common.cancel')} variant="ghost" size="sm" onPress={task.onCancel} /> : null}
      </View>
      <ProgressBar value={counting ? (task.done ?? 0) / task.total! : undefined} accessibilityLabel={task.label} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  task: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingRight: spacing.lg,
  },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 },
  message: { flex: 1 },
});
