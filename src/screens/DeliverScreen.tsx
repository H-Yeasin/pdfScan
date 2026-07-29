import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormatSegmented } from '../components/deliver/FormatSegmented';
import { MoreOptionsPanel } from '../components/deliver/MoreOptionsPanel';
import { NameField } from '../components/deliver/NameField';
import { QualitySlider } from '../components/deliver/QualitySlider';
import { StickyActions } from '../components/deliver/StickyActions';
import { useRouter } from '../navigation/router';
import { saveImagesToLibrary } from '../services/export/imageExportService';
import { bakeEnhance } from '../services/enhance/skiaEnhance';
import { buildPdfFromPages, estimateSizeBytes } from '../services/pdf/pdfService';
import { cleanTemporaryCache, deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { shareDocument } from '../services/sharing/shareService';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';
import type { LibraryDocument, LibraryPage } from '../types/models';
import { formatBytes } from '../utils/format';
import { createId } from '../utils/id';

function defaultName(): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  return `Scan_${iso}`;
}

function firstOcrLine(text?: string): string | undefined {
  if (!text) return undefined;
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  return line;
}

export function DeliverScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { pages } = state.capture;
  const { name, format, quality, more, pw } = state.deliver;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (name || pages.length === 0) return;
    const detected = firstOcrLine(pages[0]?.ocr?.text);
    dispatch({ type: 'deliver/SET_NAME', name: detected ?? defaultName() });
  }, [name, pages, dispatch]);

  const sizeEstimate = useMemo(() => estimateSizeBytes(pages, quality), [pages, quality]);

  const handleSaveInternal = useCallback(
    async (shareAfter: boolean) => {
      if (pages.length === 0 || saving) return;
      setSaving(true);
      try {
        const documentId = createId('doc');

        // Gray/B&W pages get a real pixel bake (Skia) into a fresh file before export, so the
        // effect survives into the saved PDF/JPG rather than staying a UI-only selection.
        const bakedPages = await Promise.all(
          pages.map(async (page) => {
            if (page.enhance !== 'gray' && page.enhance !== 'bw') return page;
            const baked = await bakeEnhance(page.uri, page.enhance);
            return { ...page, ...baked };
          })
        );

        const savedImages = await saveImagesToLibrary(documentId, bakedPages, quality);
        let pdfUri: string | undefined;
        let sizeBytes = savedImages.sizeBytes;

        if (format === 'PDF') {
          const pdfResult = await buildPdfFromPages(documentId, bakedPages, quality);
          pdfUri = pdfResult.uri;
          sizeBytes = pdfResult.sizeBytes;
        }

        // `saveImagesToLibrary` (and, for gray/bw pages, `bakeEnhance` before it) each wrote a
        // fresh compressed copy rather than reusing the session's cache files, so the original
        // capture-session images are now orphaned in the cache dir once the library copies
        // above exist. Sweep them here rather than leaving them for the OS to eventually reap.
        const staleCacheUris = new Set<string>();
        pages.forEach((page) => staleCacheUris.add(page.uri));
        bakedPages.forEach((page) => staleCacheUris.add(page.uri));
        cleanTemporaryCache(Array.from(staleCacheUris));

        const libraryPages: LibraryPage[] = bakedPages.map((page, i) => ({
          id: page.id,
          fileUri: savedImages.uris[i],
          width: page.width,
          height: page.height,
          ocr: page.ocr,
        }));

        const finalName = name.trim() || defaultName();
        const haystack = [finalName, ...libraryPages.map((p) => p.ocr?.text ?? '')].join(' ').toLowerCase();

        const doc: LibraryDocument = {
          id: documentId,
          name: finalName,
          format,
          mode: state.capture.mode,
          pages: libraryPages,
          pdfUri,
          sizeBytes,
          createdAt: Date.now(),
          star: false,
          tag: finalName.slice(0, 4).toUpperCase(),
          locked: pw,
          searchHaystack: haystack,
        };

        dispatch({ type: 'library/ADD_FILE', file: doc });
        dispatch({ type: 'capture/CLEAR_PAGES' });
        dispatch({ type: 'review/RESET' });
        dispatch({ type: 'deliver/RESET' });
        go('library');
        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: shareAfter ? 'Saved · sharing…' : 'Saved · My Scans',
          action: 'Undo',
          onAction: () => {
            dispatch({ type: 'library/REMOVE_FILES', ids: [documentId] });
            deleteDocumentFiles(documentId);
          },
        });

        if (shareAfter) await shareDocument(doc);
      } finally {
        setSaving(false);
      }
    },
    [pages, saving, quality, format, name, pw, state.capture.mode, dispatch, go]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('review', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
          <Text style={[styles.headerButtonLabel, { color: tokens.ink }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Deliver</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <NameField
          value={name}
          onChange={(value) => dispatch({ type: 'deliver/SET_NAME', name: value })}
          helperText="Pre-filled from the OCR-detected title."
        />

        <View>
          <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Format</Text>
          <FormatSegmented value={format} onChange={(value) => dispatch({ type: 'deliver/SET_FORMAT', format: value })} />
        </View>

        <View>
          <View style={styles.qualityHeader}>
            <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Quality</Text>
            <Text style={[styles.sizeEstimate, { color: tokens.accentInk }]}>≈ {formatBytes(sizeEstimate)}</Text>
          </View>
          <QualitySlider value={quality} onChange={(value) => dispatch({ type: 'deliver/SET_QUALITY', quality: value })} />
        </View>

        <MoreOptionsPanel
          open={more}
          onToggleOpen={() => dispatch({ type: 'deliver/TOGGLE_MORE' })}
          passwordEnabled={pw}
          onTogglePassword={() => dispatch({ type: 'deliver/TOGGLE_PW' })}
        />

        <View style={[styles.saveToRow, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={{ color: tokens.ink, fontSize: 15 }}>Save to</Text>
          <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>My Scans</Text>
        </View>
      </ScrollView>

      <StickyActions
        saving={saving}
        onSave={() => handleSaveInternal(false)}
        onSaveShare={() => handleSaveInternal(true)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: spacing.sm,
  },
  headerButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  qualityHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sizeEstimate: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveToRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
