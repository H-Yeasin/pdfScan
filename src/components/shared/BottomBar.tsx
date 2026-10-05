import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReportBottomBar } from './bottomBarHeight';

type BottomBarProps = {
  // The bar's own background: it carries on under the navigation bar, so the app looks finished
  // edge to edge while nothing tappable sits under the system buttons.
  backgroundColor: string;
  style?: StyleProp<ViewStyle>;
  // A floor for the bottom padding, for bars whose last row would otherwise touch the screen edge
  // on phones that report no inset (old Android with a solid navigation bar).
  minBottom?: number;
  children: ReactNode;
  testID?: string;
};

// §14 Q3: React Native 0.86 on Android is always edge-to-edge, so the app draws under the 3-button
// bar or the gesture pill. Every bottom-anchored bar goes through this one view, which pads by the
// bottom inset (and the side insets, which are non-zero in landscape with the 3-button bar).
export function BottomBar({ backgroundColor, style, minBottom = 0, children, testID }: BottomBarProps) {
  const insets = useSafeAreaInsets();
  // Q4: so the Snackbar floats above this bar rather than over it.
  const onLayout = useReportBottomBar();
  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={[
        styles.bar,
        style,
        {
          backgroundColor,
          paddingBottom: Math.max(insets.bottom, minBottom),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {children}
    </View>
  );
}

// For what can't be wrapped: a list's contentContainerStyle.paddingBottom (so its last row scrolls
// above the navigation bar) or a floating button's `bottom`.
export function useBottomInset(extra = 0): number {
  return useSafeAreaInsets().bottom + extra;
}

const styles = StyleSheet.create({
  bar: {
    flexGrow: 0,
  },
});
