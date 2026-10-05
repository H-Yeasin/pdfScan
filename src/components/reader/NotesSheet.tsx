import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { annotationColor, type HIGHLIGHT_COLORS, type PEN_COLORS } from '../../services/annotations/palette';
import {
  ALL_NOTES,
  filterNotes,
  groupNotesByPage,
  notesFilterOptions,
  type NoteEntry,
  type NotesFilter,
} from '../../services/annotations/notesPanel';
import { radii, spacing, useTheme, CHROME_MAX_FONT_SCALE } from '../../theme';
import { useT } from '../../i18n/useT';
import { EmptyState } from '../shared/EmptyState';

type ColourKey = keyof typeof HIGHLIGHT_COLORS | keyof typeof PEN_COLORS;

// §12 D4: the document's highlights, underlines, strikes, notes and bookmarks by page, with
// filters by kind and colour. Tapping one jumps to its page; Export shares what's shown as text.
export function NotesSheet({
  visible,
  entries,
  onOpen,
  onExport,
  onClose,
}: {
  visible: boolean;
  // notesPanel.documentNotes, in page order.
  entries: readonly NoteEntry[];
  onOpen: (entry: NoteEntry) => void;
  onExport: (shown: NoteEntry[]) => void;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<NotesFilter>(ALL_NOTES);
  const options = useMemo(() => notesFilterOptions(entries), [entries]);
  // A filter whose chip went away (its last mark was erased) would hide everything.
  useEffect(() => {
    if (filter.kind !== 'all' && !options.kinds.includes(filter.kind)) setFilter((f) => ({ ...f, kind: 'all' }));
    if (filter.color !== 'all' && !options.colors.includes(filter.color)) setFilter((f) => ({ ...f, color: 'all' }));
  }, [options, filter]);
  const shown = useMemo(() => filterNotes(entries, filter), [entries, filter]);
  const groups = useMemo(() => groupNotesByPage(shown), [shown]);
  const colourName = (key: string) => t(`reader.mark.colours.${key as ColourKey}`);

  const chip = (key: string, label: string, selected: boolean, onPress: () => void, dot?: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={dot ? t('reader.notes.colourOnly', { colour: label }) : label}
      style={[styles.chip, { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface }]}
    >
      {dot ? (
        <View style={[styles.chipDot, { backgroundColor: dot, borderColor: tokens.edge }]} />
      ) : (
        <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.chipLabel, { color: selected ? tokens.accentInk : tokens.ink }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: tokens.bg, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.ink }]}>{t('reader.notes.title')}</Text>
          {shown.length ? (
            <Pressable accessibilityRole="button" onPress={() => onExport(shown)} hitSlop={8} style={styles.export}>
              <Ionicons name="share-outline" size={18} color={tokens.accentInk} />
              <Text style={[styles.exportLabel, { color: tokens.accentInk }]}>{t('reader.notes.export')}</Text>
            </Pressable>
          ) : null}
        </View>

        {options.kinds.length || options.colors.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
            {chip('all', t('reader.notes.all'), filter.kind === 'all' && filter.color === 'all', () => setFilter(ALL_NOTES))}
            {options.kinds.map((kind) =>
              chip(kind, t(`reader.notes.kinds.${kind}`), filter.kind === kind, () => setFilter((f) => ({ ...f, kind: f.kind === kind ? 'all' : kind })))
            )}
            {options.colors.map((color) =>
              chip(
                `colour-${color}`,
                colourName(color),
                filter.color === color,
                () => setFilter((f) => ({ ...f, color: f.color === color ? 'all' : color })),
                annotationColor(color)
              )
            )}
          </ScrollView>
        ) : null}

        <ScrollView contentContainerStyle={styles.body}>
          {!entries.length ? (
            <EmptyState variant="inline" title={t('reader.notes.emptyTitle')} body={t('reader.notes.emptyBody')} />
          ) : !shown.length ? (
            <Text style={[styles.noMatch, { color: tokens.muted }]}>{t('reader.notes.noMatch')}</Text>
          ) : (
            groups.map((group) => (
              <View key={group.pageIdx} style={styles.group}>
                <Text style={[styles.pageLabel, { color: tokens.muted }]}>{t('reader.notes.page', { page: group.pageIdx + 1 })}</Text>
                {group.entries.map((entry) => {
                  const kind = t(`reader.notes.kind.${entry.kind}`);
                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="button"
                      accessibilityLabel={t('reader.notes.openOnPage', { kind, page: entry.pageIdx + 1 })}
                      onPress={() => onOpen(entry)}
                      style={[styles.row, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
                    >
                      {entry.kind === 'bookmark' ? (
                        <Ionicons name="bookmark" size={16} color={tokens.accentInk} style={styles.icon} />
                      ) : entry.kind === 'note' ? (
                        <Ionicons name="chatbox" size={16} color={annotationColor(entry.color ?? 'note')} style={styles.icon} />
                      ) : (
                        <View style={[styles.dot, { backgroundColor: annotationColor(entry.color ?? 'yellow'), borderColor: tokens.edge }]} />
                      )}
                      <View style={styles.text}>
                        <Text style={[styles.kind, { color: tokens.muted }]}>{kind}</Text>
                        {entry.text ? (
                          <Text
                            style={[
                              styles.entryText,
                              { color: tokens.ink },
                              entry.kind === 'strike' ? styles.struck : entry.kind === 'underline' ? styles.underlined : null,
                            ]}
                            numberOfLines={4}
                          >
                            {entry.text}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.4)',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  export: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  exportLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipScroll: {
    flexGrow: 0,
    marginBottom: spacing.sm,
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  chipDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  group: {
    gap: spacing.sm,
  },
  pageLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    marginTop: 2,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  kind: {
    fontSize: 12,
    fontWeight: '600',
  },
  entryText: {
    fontSize: 14,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  underlined: {
    textDecorationLine: 'underline',
  },
  noMatch: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
