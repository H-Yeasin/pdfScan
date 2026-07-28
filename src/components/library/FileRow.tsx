import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { formatBytes, formatRelativeDate } from '../../utils/format';

const LONG_PRESS_MS = 400;

type FileRowProps = {
  doc: LibraryDocument;
  selected: boolean;
  selectionMode: boolean;
  matchSnippet?: string;
  onPress: () => void;
  onLongPress: () => void;
  onToggleStar: () => void;
};

export function FileRow({ doc, selected, selectionMode, matchSnippet, onPress, onLongPress, onToggleStar }: FileRowProps) {
  const { tokens } = useTheme();
  const cover = doc.pages[0];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={LONG_PRESS_MS}
      style={[
        styles.row,
        { backgroundColor: tokens.surface, borderColor: selected ? tokens.accent : tokens.edge },
      ]}
    >
      <View style={[styles.cover, { backgroundColor: tokens.surface2 }]}>
        {cover ? <Image source={{ uri: cover.fileUri }} style={styles.coverImage} resizeMode="cover" /> : null}
        {doc.locked && (
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed-outline" size={16} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: tokens.ink }]} numberOfLines={1}>
          {doc.name}
        </Text>
        <Text style={[styles.meta, { color: tokens.muted }]}>
          {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'} · {formatBytes(doc.sizeBytes)} ·{' '}
          {formatRelativeDate(doc.createdAt)}
        </Text>
        {matchSnippet ? (
          <Text style={[styles.snippet, { color: tokens.accentInk }]} numberOfLines={1}>
            “…{matchSnippet}…”
          </Text>
        ) : null}
      </View>

      {!selectionMode && (
        <Pressable onPress={onToggleStar} hitSlop={8}>
          <Ionicons
            name={doc.star ? 'star' : 'star-outline'}
            size={19}
            color={doc.star ? tokens.accent : tokens.muted}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1.5,
  },
  cover: {
    width: 40,
    height: 52,
    borderRadius: radii.thumb,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(32,30,29,.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 15.5,
    fontWeight: '500',
  },
  meta: {
    fontSize: 13,
  },
  snippet: {
    fontSize: 12.5,
    fontFamily: 'monospace',
  },
});
