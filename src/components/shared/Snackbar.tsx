import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from '../../store/AppStateContext';
import { radii, spacing } from '../../theme';

const AUTO_DISMISS_MS = 3200;

export function Snackbar() {
  const { state, dispatch } = useAppState();
  const { snack } = state.ui;
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!snack) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dispatch({ type: 'ui/CLEAR_SNACK' }), AUTO_DISMISS_MS);
    return () => clearTimeout(timer.current);
  }, [snack, dispatch]);

  if (!snack) return null;

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]} pointerEvents="box-none">
      <View style={styles.bar}>
        <Text style={styles.message} numberOfLines={2}>
          {snack.msg}
        </Text>
        {snack.action ? (
          <Pressable
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
