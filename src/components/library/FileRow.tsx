import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ICON_SIZE, ICONS, radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { formatBytes, formatRelativeDate } from '../../utils/format';
import { isPageRasterFormat } from '../../services/documents/formatCapabilities';
import { modifiedAt } from '../../services/library/documentSort';
import { FileTypeIcon } from './FileTypeIcon';
import { useT } from '../../i18n/useT';
import { useAppSelector } from '../../store/AppStateContext';
import { INDEX_MAX_PAGES } from '../../services/documents/importedPdfIndex';
import { useThumb } from '../shared/PageThumb';
import { AppImage } from '../shared/AppImage';
import { rotationStyle } from '../../utils/rotation';
import { useRenderCount } from '../../utils/renderCounts';
import { ListItem, Touchable } from '../ui';

type FileRowProps = {
  doc: LibraryDocument;
  selected: boolean;
  selectionMode: boolean;
  matchSnippet?: string;
  // The course's colour, shown as a dot on the cover where rows from several courses mix (Files,
  // search results). Undefined: no dot.
  courseColor?: string;
  // Take the row's document, so the parent can pass one stable handler (`useStableCallback`) to
  // every row and `memo` can skip rows whose data didn't change (§9 O5).
  onPress: (doc: LibraryDocument) => void;
  onLongPress: (doc: LibraryDocument) => void;
  // §17 U7: the ⋯ that opens the row's menu (fileTools.rowMenuSections).
  onMore: (doc: LibraryDocument) => void;
};

// §17 U7: a document in a list, on the kit's ListItem: the cover, the name, what it is and when it
// last changed, and a ⋯ for everything that can be done to it. In selection mode the row shows a
// checkbox (TalkBack: "checkbox, checked") and the ⋯ steps aside.
export const FileRow = memo(function FileRow({ doc, selected, selectionMode, matchSnippet, courseColor, onPress, onLongPress, onMore }: FileRowProps) {
  useRenderCount('FileRow');
  const { t } = useT();
  const indexNote = useIndexNote(doc);

  const meta = `${isPageRasterFormat(doc.format) ? t('library.pages', { count: doc.pages.length }) : doc.format} · ${formatBytes(doc.sizeBytes)} · ${formatRelativeDate(modifiedAt(doc))}${doc.archived ? t('library.archivedSuffix') : ''}`;
  // The second line carries what matters most right now: missing files, then the indexer, then the
  // search match.
  const note = doc.missingFiles ? t('library.filesMissing') : indexNote ?? (matchSnippet ? `“…${matchSnippet}…”` : undefined);

  return (
    <ListItem
      title={doc.name}
      subtitle={note ? `${meta}\n${note}` : meta}
      leading={<FileCover doc={doc} courseColor={courseColor} />}
      trailing={selectionMode ? undefined : 'more'}
      onMore={() => onMore(doc)}
      moreLabel={t('library.rowMore', { name: doc.name })}
      selected={selectionMode ? selected : undefined}
      onPress={() => onPress(doc)}
      onLongPress={() => onLongPress(doc)}
      accessibilityHint={selectionMode ? undefined : t('library.rowHint')}
      testID={`file-row-${doc.id}`}
    />
  );
});

// The 400 px thumbnail (§16 G6) or the format's icon, with the course dot, a star and the lock.
export function FileCover({ doc, courseColor, large = false }: { doc: LibraryDocument; courseColor?: string; large?: boolean }) {
  const { tokens } = useTheme();
  const { t } = useT();
  const cover = doc.pages[0];
  const coverUri = useThumb(doc.id, cover);

  return (
    <View style={[large ? styles.coverLarge : styles.cover, { backgroundColor: tokens.surface2 }]}>
      {coverUri ? (
        // The row is recycled (FlashList): keyed, so it never shows another document's cover.
        <AppImage uri={coverUri} recyclingKey={doc.id} style={[styles.coverImage, rotationStyle(cover?.rotation)]} />
      ) : (
        <FileTypeIcon format={doc.format} size={large ? 28 : 18} />
      )}
      {courseColor ? <View style={[styles.courseDot, { backgroundColor: courseColor, borderColor: tokens.surface }]} /> : null}
      {doc.star ? (
        <View style={[styles.star, { backgroundColor: tokens.surface }]} accessible accessibilityLabel={t('library.starredLabel')}>
          <Ionicons name="star" size={ICON_SIZE.inline - 4} color={tokens.highlight} />
        </View>
      ) : null}
      {doc.locked ? (
        <Touchable
          style={[styles.lockOverlay, { backgroundColor: tokens.scrim }]}
          onPress={() => Alert.alert(t('library.notEncrypted'), t('library.lockDisclosure'))}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.lockInfo')}
          scale={false}
        >
          <Ionicons name={ICONS.lock} size={ICON_SIZE.inline} color={tokens.surface} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: 40,
    height: 52,
    borderRadius: radii.thumb,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverLarge: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radii.thumb,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  courseDot: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    width: 10,
    height: 10,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  star: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// §7 R1: what search covers in an imported PDF - while it's being read, and when it couldn't be
// read in full. Nothing for a fully indexed PDF or any other document.
function useIndexNote(doc: LibraryDocument): string | null {
  // Only this document's progress: other documents' ticks don't re-render this row.
  const progress = useAppSelector((s) => (s.libraryUi.indexing?.documentId === doc.id ? s.libraryUi.indexing : null));
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
