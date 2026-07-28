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
          <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
            {name}
          </Text>
        )}
        {findOpen ? (
          <Text style={[styles.matchCount, { color: tokens.muted }]}>{matchCount}</Text>
        ) : (
          <Pressable style={styles.iconButton} onPress={onOverflow}>
            <Ionicons name="ellipsis-vertical" size={18} color={tokens.ink} />
          </Pressable>
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
    height: 44,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
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
