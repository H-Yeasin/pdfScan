import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { radii, spacing } from '../../theme';
import { announce } from '../../services/a11y/announce';
import { useBottomBarHeight } from './bottomBarHeight';

const AUTO_DISMISS_MS = 3200;

export function Snackbar() {
  const dispatch = useAppDispatch();
  const state = useAppSlices('ui');
  const { snack } = state.ui;
  const insets = useSafeAreaInsets();
  // §14 Q4: above the screen's bottom bar (tab bar, selection bar, Reader tools) when there is one,
  // otherwise above the navigation bar. The bar's height already includes the inset.
  const barHeight = useBottomBarHeight();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!snack) return;
    announce(snack.msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dispatch({ type: 'ui/CLEAR_SNACK' }), AUTO_DISMISS_MS);
    return () => clearTimeout(timer.current);
  }, [snack, dispatch]);

  if (!snack) return null;

  return (
    <View style={[styles.container, { bottom: barHeight > 0 ? barHeight + spacing.sm : Math.max(insets.bottom, spacing.md) + spacing.sm }]} pointerEvents="box-none">
      <View style={styles.bar} accessibilityLiveRegion="polite">
        <Text style={styles.message} numberOfLines={2}>
          {snack.msg}
        </Text>
        {snack.action ? (
          <Pressable accessibilityRole="button"
            onPress={() => {
              snack.onAction?.();
              dispatch({ type: 'ui/CLEAR_SNACK' });
            }}
            hitSlop={8}
          >
            <Text style={styles.action}>{snack.action}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: '#2a2723',
  },
  message: {
    flex: 1,
    color: '#f6f0e4',
    fontSize: 14.5,
  },
  action: {
    color: '#7fe3cd',
    fontSize: 14,
    fontWeight: '700',
  },
});
