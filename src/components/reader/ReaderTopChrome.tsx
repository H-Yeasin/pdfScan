import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily, spacing, useTheme } from '../../theme';

type ReaderTopChromeProps = {
  visible: Animated.AnimatedInterpolation<number> | Animated.Value;
  name: string;
  onBack: () => void;
  onOverflow: () => void;
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
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: tokens.surface,
          borderBottomColor: tokens.edge,
          paddingTop: insets.top,
          opacity: visible,
          transform: [{ translateY: visible.interpolate({ inputRange: [0, 1], outputRange: [-110, 0] }) }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        <Pressable style={styles.iconButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        {findOpen ? (
          <TextInput
            value={findQuery}
            onChangeText={onChangeFindQuery}
            placeholder="Find in document"
            placeholderTextColor={tokens.muted}
            autoFocus
            style={[styles.findInput, { color: tokens.ink }]}
          />
        ) : (
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
              {name}
            </Text>
            {subtitle ? (
              <Pressable onPress={onSubtitlePress} disabled={!onSubtitlePress} hitSlop={6} accessibilityRole="button">
                <Text style={[styles.subtitle, { color: tokens.accentInk }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {findOpen ? (
          <Text style={[styles.matchCount, { color: tokens.muted }]}>{matchCount}</Text>
        ) : (
          <>
            {bookmarked !== undefined && onBookmark ? (
              <Pressable
                style={styles.iconButton}
                onPress={onBookmark}
                onLongPress={onBookmarkLongPress}
                accessibilityRole="button"
                accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                accessibilityHint="Long-press to add a label"
              >
                <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={19} color={bookmarked ? tokens.accentInk : tokens.ink} />
              </Pressable>
            ) : null}
            <Pressable style={styles.iconButton} onPress={onOverflow}>
              <Ionicons name="ellipsis-vertical" size={18} color={tokens.ink} />
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

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
    minHeight: 44,
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
});
