import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PageHit } from '../../services/persistence/dbService';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { useT } from '../../i18n/useT';

const SHOWN_PER_DOCUMENT = 3;

// "[photo]synthesis …" → text runs with the [bracketed] matches bold.
function SnippetText({ snippet, color, matchColor }: { snippet: string; color: string; matchColor: string }) {
  const parts = snippet.split(/(\[[^\]]*\])/);
  return (
    <Text style={[styles.snippet, { color }]} numberOfLines={2}>
      {parts.map((part, i) =>
        part.startsWith('[') && part.endsWith(']') ? (
          <Text key={i} style={[styles.match, { color: matchColor }]}>
            {part.slice(1, -1)}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

// §5 T2: the Pages section of Library search, grouped by document (best match first); a document
// with more than 3 matching pages shows 3 and "+n more pages".
export function PageResults({
  hits,
  docs,
  onOpen,
  onAddAll,
}: {
  hits: readonly PageHit[];
  docs: readonly LibraryDocument[];
  onOpen: (doc: LibraryDocument, hit: PageHit) => void;
  // §5 T6: puts every listed page in the exam-pack tray.
  onAddAll?: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups: { doc: LibraryDocument; hits: PageHit[] }[] = [];
  for (const hit of hits) {
    const doc = docs.find((d) => d.id === hit.documentId);
    if (!doc) continue;
    const group = groups.find((g) => g.doc.id === doc.id);
    if (group) group.hits.push(hit);
    else groups.push({ doc, hits: [hit] });
  }
  if (groups.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: tokens.muted }]}>{t('library.pageResults')}</Text>
        {onAddAll ? (
          <Pressable onPress={onAddAll} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.moreLabel, { color: tokens.accentInk }]}>
              {t('library.addHitsToPack', { count: hits.length })}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {groups.map(({ doc, hits: docHits }) => {
        const open = expanded.has(doc.id);
        const shown = open ? docHits : docHits.slice(0, SHOWN_PER_DOCUMENT);
        return (
          <View key={doc.id} style={styles.group}>
            {shown.map((hit) => {
              const page = doc.pages[hit.idx];
              return (
                <Pressable
                  key={hit.pageId}
                  style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
                  onPress={() => onOpen(doc, hit)}
                  accessibilityRole="button"
                  accessibilityLabel={t('library.hitA11y', { doc: doc.name, page: hit.idx + 1 })}
                >
                  <View style={[styles.thumb, { backgroundColor: tokens.surface2 }]}>
                    {page ? <Image source={{ uri: page.thumbUri ?? page.fileUri }} style={styles.thumbImage} resizeMode="cover" /> : null}
                  </View>
                  <View style={styles.text}>
                    <Text style={[styles.name, { color: tokens.ink }]} numberOfLines={1}>
                      {doc.name} · p. {hit.idx + 1}
                    </Text>
                    <SnippetText snippet={hit.snippet} color={tokens.muted} matchColor={tokens.ink} />
                  </View>
                </Pressable>
              );
            })}
            {docHits.length > SHOWN_PER_DOCUMENT && !open ? (
              <Pressable
                onPress={() => setExpanded((prev) => new Set(prev).add(doc.id))}
                accessibilityRole="button"
                hitSlop={6}
                style={styles.more}
              >
                <Text style={[styles.moreLabel, { color: tokens.accentInk }]}>
                  {t('library.moreHits', { count: docHits.length - SHOWN_PER_DOCUMENT, doc: doc.name })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  group: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 44,
    height: 58,
    borderRadius: radii.thumb,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  text: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
  snippet: {
    fontSize: 13,
    lineHeight: 18,
  },
  match: {
    fontWeight: '700',
  },
  more: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
  },
  moreLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
