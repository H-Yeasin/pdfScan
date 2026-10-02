import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';
import { readTextWithEncodingFallback } from '../../services/documents/txtService';
import { useT } from '../../i18n/useT';

const CHUNK_SIZE = 3000;

// Splits into FlatList-sized chunks snapped to the nearest preceding newline (so no line ever
// splits mid-way across two chunks) - a multi-MB file as one Text node is a known perf/crash
// source, per the plan's TxtView spec.
function chunkText(text: string): string[] {
  if (!text) return [''];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline > start) end = lastNewline + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function countOccurrences(chunks: string[], query: string): { total: number; firstChunkIndex: number } {
  const needle = query.trim().toLowerCase();
  if (!needle) return { total: 0, firstChunkIndex: -1 };
  let total = 0;
  let firstChunkIndex = -1;
  chunks.forEach((chunk, i) => {
    const haystack = chunk.toLowerCase();
    let from = 0;
    let count = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      count += 1;
      from = at + needle.length;
    }
    if (count > 0) {
      total += count;
      if (firstChunkIndex === -1) firstChunkIndex = i;
    }
  });
  return { total, firstChunkIndex };
}

type TxtViewProps = {
  uri: string;
  night: boolean;
  findQuery: string;
  onMatchCount: (count: number) => void;
  onTap?: () => void;
};

export function TxtView({ uri, night, findQuery, onMatchCount, onTap }: TxtViewProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [chunks, setChunks] = useState<string[] | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [error, setError] = useState(false);
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    let cancelled = false;
    setChunks(null);
    setError(false);
    readTextWithEncodingFallback(uri)
      .then(({ text, fallbackUsed }) => {
        if (cancelled) return;
        setChunks(chunkText(text));
        setFallbackUsed(fallbackUsed);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('TxtView: failed to read', uri, e);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const { total, firstChunkIndex } = useMemo(
    () => (chunks ? countOccurrences(chunks, findQuery) : { total: 0, firstChunkIndex: -1 }),
    [chunks, findQuery]
  );

  useEffect(() => {
    onMatchCount(total);
  }, [total, onMatchCount]);

  useEffect(() => {
    if (firstChunkIndex >= 0) listRef.current?.scrollToIndex({ index: firstChunkIndex, viewPosition: 0.2 });
  }, [firstChunkIndex]);

  if (error) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.openFailed')}</Text>
      </View>
    );
  }

  if (!chunks) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: night ? '#14120f' : tokens.bg }]}>
      {fallbackUsed && (
        <View style={[styles.banner, { backgroundColor: tokens.accentSoft }]}>
          <Text style={[styles.bannerText, { color: tokens.accentInk }]}>
            {t('reader.notUtf8')}
          </Text>
        </View>
      )}
      <FlatList
        ref={listRef}
        data={chunks}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={onTap}>
            <Text style={[styles.text, { color: night ? '#f2eade' : tokens.ink }]}>{item}</Text>
          </Pressable>
        )}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg },
  text: { fontSize: 14.5, lineHeight: 21, fontFamily: 'monospace' },
  banner: { padding: spacing.sm },
  bannerText: { fontSize: 12.5, textAlign: 'center' },
});
