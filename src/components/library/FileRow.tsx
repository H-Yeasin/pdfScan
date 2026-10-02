import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { formatBytes, formatRelativeDate } from '../../utils/format';
import { isPageRasterFormat } from '../../services/documents/formatCapabilities';
import { FileTypeIcon } from './FileTypeIcon';
import { useT } from '../../i18n/useT';
import { useAppSelector } from '../../store/AppStateContext';
import { INDEX_MAX_PAGES } from '../../services/documents/importedPdfIndex';
import { rotationStyle } from '../../utils/rotation';


const LONG_PRESS_MS = 400;

type FileRowProps = {
  doc: LibraryDocument;
  selected: boolean;
  selectionMode: boolean;
  matchSnippet?: string;
  // The course's colour, shown as a dot before the name where rows from several courses mix
  // (Library, search results). Undefined: no dot.
  courseColor?: string;
  // Take the row's document, so the parent can pass one stable handler (`useStableCallback`) to
  // every row and `memo` can skip rows whose data didn't change (§9 O5).
  onPress: (doc: LibraryDocument) => void;
  onLongPress: (doc: LibraryDocument) => void;
  onToggleStar: (doc: LibraryDocument) => void;
};

export const FileRow = memo(function FileRow({
  doc,
  selected,
  selectionMode,
  matchSnippet,
  courseColor,
  onPress,
  onLongPress,
  onToggleStar,
}: FileRowProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const cover = doc.pages[0];
  const indexNote = useIndexNote(doc);

  return (
    <Pressable
      onPress={() => onPress(doc)}
      onLongPress={() => onLongPress(doc)}
      delayLongPress={LONG_PRESS_MS}
      style={[
        styles.row,
        { backgroundColor: tokens.surface, borderColor: selected ? tokens.accent : tokens.edge },
      ]}
    >
      <View style={[styles.cover, { backgroundColor: tokens.surface2 }]}>
        {cover?.thumbUri || cover?.fileUri ? (
          <Image source={{ uri: cover.thumbUri || cover.fileUri }} style={[styles.coverImage, rotationStyle(cover.rotation)]} resizeMode="cover" />
        ) : (
          <FileTypeIcon format={doc.format} size={18} />
        )}
        {doc.locked && (
          <Pressable
            style={styles.lockOverlay}
            onPress={() => Alert.alert(t('library.notEncrypted'), t('library.lockDisclosure'))}
            hitSlop={4}
          >
            <Ionicons name="lock-closed-outline" size={16} color="#fff" />
          </Pressable>
        )}
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          {courseColor ? <View style={[styles.courseDot, { backgroundColor: courseColor }]} /> : null}
          <Text style={[styles.name, { color: tokens.ink }]} numberOfLines={1}>
            {doc.name}
          </Text>
        </View>
        <Text style={[styles.meta, { color: tokens.muted }]}>
          {isPageRasterFormat(doc.format)
            ? t('library.pages', { count: doc.pages.length })
            : doc.format}{' '}
          · {formatBytes(doc.sizeBytes)} · {formatRelativeDate(doc.createdAt)}
          {doc.archived ? t('library.archivedSuffix') : ''}
        </Text>
        {doc.missingFiles ? (
          <Text style={[styles.meta, { color: tokens.danger }]} numberOfLines={1}>
            {t('library.filesMissing')}
          </Text>
        ) : null}
        {indexNote ? (
          <Text style={[styles.meta, { color: tokens.muted }]} numberOfLines={1}>
            {indexNote}
          </Text>
        ) : null}
        {matchSnippet ? (
          <Text style={[styles.snippet, { color: tokens.accentInk }]} numberOfLines={1}>
            “…{matchSnippet}…”
          </Text>
        ) : null}
      </View>

      {!selectionMode && (
        <Pressable onPress={() => onToggleStar(doc)} hitSlop={8}>
          <Ionicons
            name={doc.star ? 'star' : 'star-outline'}
            size={19}
            color={doc.star ? tokens.accent : tokens.muted}
          />
        </Pressable>
      )}
    </Pressable>
  );
});

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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  courseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    flexShrink: 1,
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

// §7 R1: what search covers in an imported PDF - while it's being read, and when it couldn't be
// read in full. Nothing for a fully indexed PDF or any other document.
function useIndexNote(doc: LibraryDocument): string | null {
  // Only this document's progress: other documents' ticks don't re-render this row.
  const progress = useAppSelector((s) => (s.library.indexing?.documentId === doc.id ? s.library.indexing : null));
  const { t } = useT();
  if (doc.sourceKind !== 'imported_pdf') return null;
  if (progress) return t('library.index.reading', { done: progress.done, total: progress.total });
  switch (doc.indexState) {
    case 'partial':
      return t('library.index.partial', { count: INDEX_MAX_PAGES });
    case 'encrypted':
      return t('library.index.encrypted');
    case 'failed':
      return t('library.index.failed');
    default:
      return null;
  }
}
