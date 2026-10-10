import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily, spacing, useTheme, touchSlop, CHROME_MAX_FONT_SCALE } from '../../theme';
import { useT } from '../../i18n/useT';
import type { PageLabel } from '../../services/documents/readerPosition';

type ReaderTopChromeProps = {
  visible: Animated.AnimatedInterpolation<number> | Animated.Value;
  name: string;
  onBack: () => void;
  onOverflow: () => void;
  // §12 D2: "12 / 40" next to the title; tap to type a page (R4). Hidden while the count is 0
  // (still loading, or a viewer without pages). §18 W5: library page numbers
  // (readerPosition.pageLabel), "3–4 / 12" for the two pages of a 2-in-1 sheet.
  page: PageLabel;
  onJump?: () => void;
  // Undefined: the format has no Find (formatCapabilities.IN_READER_FIND_FORMATS).
  onFind?: () => void;
  findOpen: boolean;
  findQuery: string;
  onChangeFindQuery: (value: string) => void;
  matchCount: number;
  // A line under the name (e.g. "Submitted 2× · last on 3 Oct"); tappable when onSubtitlePress.
  subtitle?: string | null;
  onSubtitlePress?: () => void;
  // §5 T5: the current page's bookmark (filled when bookmarked); long-press to label it.
  // Undefined: no bookmark button (external files).
  bookmarked?: boolean;
  onBookmark?: () => void;
  onBookmarkLongPress?: () => void;
};

export function ReaderTopChrome({
  visible,
  name,
  onBack,
  onOverflow,
  page,
  onJump,
  onFind,
  findOpen,
  findQuery,
  onChangeFindQuery,
  matchCount,
  subtitle,
  onSubtitlePress,
  bookmarked,
  onBookmark,
  onBookmarkLongPress,
}: ReaderTopChromeProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  // §18 W2: the bar slides away by its own height (status bar inset and a subtitle line included),
  // not by a fixed distance. Until the first layout it is the row under the inset; the bar starts
  // shown, so that estimate is never on screen.
  const [height, setHeight] = useState(0);
  const hideBy = height || insets.top + ROW_HEIGHT;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: tokens.surface,
          borderBottomColor: tokens.edge,
          paddingTop: insets.top,
          // §14 Q3: in landscape the 3-button bar sits on a side.
          paddingLeft: insets.left,
          paddingRight: insets.right,
          opacity: visible,
          transform: [{ translateY: visible.interpolate({ inputRange: [0, 1], outputRange: [-hideBy, 0] }) }],
        },
      ]}
      pointerEvents="box-none"
      onLayout={(e) => setHeight(Math.ceil(e.nativeEvent.layout.height))}
    >
      <View style={styles.row}>
        <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={onBack} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        {findOpen ? (
          <TextInput
            value={findQuery}
            onChangeText={onChangeFindQuery}
            placeholder={t('reader.findPlaceholder')}
            placeholderTextColor={tokens.muted}
            autoFocus
            style={[styles.findInput, { color: tokens.ink }]}
          />
        ) : (
          <View style={styles.titleWrap}>
            <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
              {name}
            </Text>
            {subtitle ? (
              <Pressable onPress={onSubtitlePress} disabled={!onSubtitlePress} hitSlop={6} accessibilityRole="button">
                <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.subtitle, { color: tokens.accentInk }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {findOpen ? (
          <>
            <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.matchCount, { color: tokens.muted }]}>{matchCount}</Text>
            <Pressable hitSlop={touchSlop(44)} style={styles.iconButton} onPress={onFind} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={20} color={tokens.ink} />
            </Pressable>
          </>
        ) : (
          <>
            {page.count > 0 ? (
              <Pressable
                style={styles.indicator}
                onPress={onJump}
                disabled={!onJump}
                accessibilityRole="button"
                accessibilityLabel={
                  page.last > page.first
                    ? t('reader.pageRangeA11y', { first: page.first, last: page.last, count: page.count })
                    : t('reader.pageA11y', { page: page.first, count: page.count })
                }
              >
                <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.indicatorText, { color: tokens.ink }]} numberOfLines={1}>
                  {page.last > page.first
                    ? t('reader.pageRange', { first: page.first, last: page.last, count: page.count })
                    : t('reader.pageIndicator', { page: page.first, count: page.count })}
                </Text>
              </Pressable>
            ) : null}
            {onFind ? (
              <Pressable hitSlop={touchSlop(44)} style={styles.iconButton} onPress={onFind} accessibilityRole="button" accessibilityLabel={t('reader.find')}>
                <Ionicons name="search" size={19} color={tokens.ink} />
              </Pressable>
            ) : null}
            {bookmarked !== undefined && onBookmark ? (
              <Pressable hitSlop={touchSlop(44)}
                style={styles.iconButton}
                onPress={onBookmark}
                onLongPress={onBookmarkLongPress}
                accessibilityRole="button"
                accessibilityLabel={bookmarked ? t('reader.removeBookmark') : t('reader.bookmarkPage')}
                accessibilityHint={t('reader.bookmarkHint')}
              >
                <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={19} color={bookmarked ? tokens.accentInk : tokens.ink} />
              </Pressable>
            ) : null}
            <Pressable hitSlop={touchSlop(44)} style={styles.iconButton} onPress={onOverflow} accessibilityRole="button" accessibilityLabel={t('a11y.moreActions')}>
              <Ionicons name="ellipsis-vertical" size={18} color={tokens.ink} />
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

// Also what a viewer that the bar lies over leaves free above its first line (§18 W4, DocxView).
export const ROW_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    minHeight: ROW_HEIGHT,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontFamily: fontFamily.bodySemiBold,
  },
  findInput: {
    flex: 1,
    fontSize: 15,
  },
  matchCount: {
    fontSize: 13,
    paddingHorizontal: spacing.sm,
  },
  indicator: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  indicatorText: {
    fontSize: 13.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
