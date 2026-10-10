import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typeScale, useTheme, CHROME_MAX_FONT_SCALE } from '../../theme';
import { useT } from '../../i18n/useT';
import type { ReaderTool, ReaderToolId } from '../../services/documents/readerTools';
import { ProBadge } from '../pro/ProBadge';
import { useReportBottomBar } from '../shared/bottomBarHeight';

const ICONS: Record<ReaderToolId, keyof typeof Ionicons.glyphMap> = {
  mark: 'color-fill-outline',
  selectText: 'text-outline',
  notes: 'list-outline',
  pages: 'albums-outline',
  convertEdit: 'swap-horizontal-outline',
};

type ReaderToolBarProps = {
  visible: Animated.Value;
  // services/documents/readerTools.readerTools; with none, there's no bar.
  tools: ReaderTool[];
  onPress: (id: ReaderToolId) => void;
};

// §12 D2: the Reader's bottom tool bar, study first: the actions used while reading are one tap
// away. Sharing and managing the file live in More (OverflowSheet).
export function ReaderToolBar({ visible, tools, onPress }: ReaderToolBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const reportHeight = useReportBottomBar();
  const bottomPadding = Math.max(insets.bottom, spacing.sm);
  // §18 W2: the bar slides away by its own height. A fixed 60 px left its top edge, and its
  // (invisible, still tappable) buttons, on screen above a 3-button navigation bar. Until the
  // first layout it is the row plus its paddings; the bar starts shown, so that estimate is
  // never on screen.
  const [height, setHeight] = useState(0);
  const hideBy = height || ITEM_HEIGHT + spacing.sm + bottomPadding;
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      setHeight(Math.ceil(e.nativeEvent.layout.height));
      reportHeight(e);
    },
    [reportHeight]
  );
  if (tools.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: tokens.surface,
          borderTopColor: tokens.edge,
          // §14 Q3: the bar's background runs under the navigation bar; its buttons sit above it
          // (and clear of a side 3-button bar in landscape). Animated, so it can't be a BottomBar.
          paddingBottom: bottomPadding,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          opacity: visible,
          transform: [{ translateY: visible.interpolate({ inputRange: [0, 1], outputRange: [hideBy, 0] }) }],
        },
      ]}
      pointerEvents="box-none"
      onLayout={onLayout}
      testID="reader-tool-bar"
    >
      <View style={styles.row}>
        {tools.map((tool) => (
          <Pressable accessibilityRole="button" key={tool.id} style={styles.item} onPress={() => onPress(tool.id)}>
            <View style={styles.iconRow}>
              <Ionicons name={ICONS[tool.id]} size={21} color={tokens.ink} />
              {tool.pro ? <ProBadge /> : null}
            </View>
            <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.label, { color: tokens.ink }]} numberOfLines={1}>
              {t(`reader.tools.${tool.id}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const ITEM_HEIGHT = 52;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  item: {
    flex: 1,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontFamily: typeScale.label.fontFamily,
    fontWeight: '600',
  },
});
