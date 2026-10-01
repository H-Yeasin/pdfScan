import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FolderPickerModal } from '../components/deliver/FolderPickerModal';
import { FormatSegmented } from '../components/deliver/FormatSegmented';
import { LayoutModeSegmented } from '../components/deliver/LayoutModeSegmented';
import { MoreOptionsPanel } from '../components/deliver/MoreOptionsPanel';
import { NameField } from '../components/deliver/NameField';
import { QualitySlider } from '../components/deliver/QualitySlider';
import { StickyActions } from '../components/deliver/StickyActions';
import { useRouter } from '../navigation/router';
import { summarizeAcademicConfig } from './AcademicOptionsScreen';
import { saveImagesToLibrary } from '../services/export/imageExportService';
import { exportCopyToDeviceFolder } from '../services/export/deviceExportService';
import { DEFAULT_ADJUST } from '../services/enhance/adjust';
import { renderPage } from '../services/enhance/skiaEnhance';
import { MASTER_PRESET } from '../services/capture/imageSpec';
import { runOcr } from '../services/ocr/ocrService';
import { buildSearchHaystack } from '../services/search/searchService';
import { renderCoverPageImage, stampContentPageImage } from '../services/pdf/academicRasterService';
import { buildPdfFromPages, encodingForQuality, estimateSizeBytes } from '../services/pdf/pdfService';
import { cleanTemporaryCache, deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { shareDocument } from '../services/sharing/shareService';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';
import type { LibraryDocument, LibraryPage, PageOcr } from '../types/models';
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

// One page on its way into the library: its rendered master (+ optional stamped display copy).
// Lighter than SessionPage since a rasterized cover page has no rotation/enhance of its own.
type LibraryInputPage = {
  id: string;
  masterUri: string;
  displayUri?: string;
  keepSource?: boolean;
  width: number;
  height: number;
  ocr?: PageOcr;
  ocrFailed?: boolean;
};

export function DeliverScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { pages } = state.capture;
  const { name, format, quality, more, courseId, exportCopy, academicConfig, layoutMode } = state.deliver;
  const { courses } = state.library;
  const { androidExportFolderUri, androidExportFolderLabel, ocrScript } = state.settings;
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  const courseName = useMemo(
    () => courses.find((c) => c.id === courseId)?.name ?? 'Unsorted',
    [courses, courseId]
  );

  const handleCreateCourse = useCallback(
    (name: string) => {
      const id = createId('course');
      dispatch({ type: 'library/CREATE_COURSE', id, name });
      return id;
    },
    [dispatch]
  );

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
        const encoding = encodingForQuality(quality);
        const total = pages.length;
        const transientUris = new Set<string>();

        // One page at a time (never Promise.all): each page is rendered from its session master in
        // a single Skia pass (rotation + filter + resize + one JPEG encode) - once at master spec
        // for the library, and once more at the export preset only if that differs. OCR then runs
        // on the final master pixels, so the PDF's text layer always lines up with what was saved,
        // whatever was rotated or cropped in Review.
        const contentPages: (LibraryInputPage & { exportUri: string })[] = [];
        for (let i = 0; i < total; i++) {
          const page = pages[i];
          setProgress(`Preparing page ${i + 1} of ${total}…`);
          const edits = { rotation: page.rotation, enhance: page.enhance, adjust: page.adjust ?? DEFAULT_ADJUST };
          const master = await renderPage(page.uri, edits, MASTER_PRESET);
          const exported = encoding === 'as-is' ? master : await renderPage(page.uri, edits, encoding);
          if (exported !== master) transientUris.add(exported.uri);
          const ocr = await runOcr(master.uri, ocrScript);
          contentPages.push({
            id: page.id,
            masterUri: master.uri,
            exportUri: exported.uri,
            width: master.width,
            height: master.height,
            ocr,
            ocrFailed: ocr === undefined,
          });
        }

        // ReaderScreen shows each LibraryPage's own image, not the compiled PDF, so an academic
        // border/header-footer also needs to exist as pixels - on a separate display copy, so the
        // master stays clean for later rebuilds. The PDF itself gets the crisp vector version.
        let coverPage: LibraryInputPage | null = null;
        if (format === 'PDF' && academicConfig) {
          if (academicConfig.enableBorder || academicConfig.headerText || academicConfig.footerText) {
            for (let i = 0; i < contentPages.length; i++) {
              setProgress(`Stamping page ${i + 1} of ${total}…`);
              const stamped = await stampContentPageImage(contentPages[i].masterUri, academicConfig, i + 1, total);
              contentPages[i].displayUri = stamped.uri;
            }
          }
          if (academicConfig.coverPage) {
            const rendered = await renderCoverPageImage(academicConfig.coverPage);
            if (rendered) {
              coverPage = {
                id: createId('page'),
                masterUri: rendered.uri,
                width: rendered.width,
                height: rendered.height,
                // An imported cover is the user's own picked file - copy it, don't move it.
                keepSource: rendered.uri === academicConfig.coverPage.importedUri,
              };
            }
          }
        }

        // Always build a document.pdf, regardless of the chosen export `format` - the unified
        // reader renders every library doc through the real PDF engine, so a JPG-format doc needs
        // a real PDF behind it too. Pages are already encoded for export, so they go in as-is.
        setProgress('Building PDF…');
        const pdfResult = await buildPdfFromPages(
          documentId,
          contentPages.map((p) => ({ uri: p.exportUri, width: p.width, height: p.height, ocr: p.ocr })),
          'as-is',
          academicConfig ?? undefined,
          layoutMode
        );
        const pdfUri: string = pdfResult.uri;

        const libraryInputPages: LibraryInputPage[] = coverPage ? [coverPage, ...contentPages] : contentPages;
        const savedImages = await saveImagesToLibrary(
          documentId,
          libraryInputPages.map((p) => ({ masterUri: p.masterUri, displayUri: p.displayUri, keepSource: p.keepSource }))
        );
        const sizeBytes = format === 'PDF' ? pdfResult.sizeBytes : savedImages.sizeBytes;

        // The session's own masters/thumbnails and any export-only renders are now superseded by
        // the library copies.
        pages.forEach((page) => {
          transientUris.add(page.uri);
          if (page.thumbUri) transientUris.add(page.thumbUri);
          // A Book-mode half keeps its original spread around for "Undo split".
          if (page.splitFrom) {
            transientUris.add(page.splitFrom.uri);
            if (page.splitFrom.thumbUri) transientUris.add(page.splitFrom.thumbUri);
          }
        });
        cleanTemporaryCache(Array.from(transientUris));

        const libraryPages: LibraryPage[] = libraryInputPages.map((page, i) => ({
          id: page.id,
          ...savedImages.pages[i],
          width: page.width,
          height: page.height,
          ocr: page.ocr,
          ocrFailed: page.ocrFailed || undefined,
        }));

        const finalName = name.trim() || defaultName();
        const haystack = buildSearchHaystack(finalName, libraryPages);

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
          locked: false,
          searchHaystack: haystack,
          courseId: courseId ?? undefined,
          // Only set when a cover page actually made it into libraryPages[0] - mirrors
          // coverPage's own condition, not just whether academicConfig exists.
          coverKind: coverPage ? academicConfig?.coverPage?.mode : undefined,
        };

        dispatch({ type: 'library/ADD_FILE', file: doc });
        dispatch({ type: 'capture/CLEAR_PAGES' });
        dispatch({ type: 'review/RESET' });
        dispatch({ type: 'deliver/RESET' });
        go('library');

        // The device-folder copy runs after the in-app save has already succeeded and never
        // blocks or replaces it — a SAF failure here must not affect the primary save/undo flow.
        let snackMsg = shareAfter ? 'Saved · sharing…' : `Saved · ${courseName}`;
        if (!shareAfter && Platform.OS === 'android' && exportCopy && androidExportFolderUri) {
          const result = await exportCopyToDeviceFolder(androidExportFolderUri, doc);
          snackMsg =
            result.failed === 0
              ? `Saved · ${courseName} · copied to ${androidExportFolderLabel ?? 'device folder'}`
              : `Saved · ${courseName} · copy to device folder failed`;
        }

        dispatch({
          type: 'ui/SHOW_SNACK',
          msg: snackMsg,
          action: 'Undo',
          onAction: () => {
            dispatch({ type: 'library/REMOVE_FILES', ids: [documentId] });
            deleteDocumentFiles(documentId);
          },
        });

        if (shareAfter) await shareDocument(doc);
      } catch (error) {
        console.warn('DeliverScreen: save failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: "Couldn't save. Your pages are still here." });
      } finally {
        setSaving(false);
        setProgress(null);
      }
    },
    [
      pages,
      saving,
      quality,
      format,
      name,
      courseId,
      courseName,
      ocrScript,
      exportCopy,
      academicConfig,
      layoutMode,
      androidExportFolderUri,
      androidExportFolderLabel,
      state.capture.mode,
      dispatch,
      go,
    ]
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
          <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Page Layout</Text>
          <LayoutModeSegmented
            value={layoutMode}
            onChange={(value) => dispatch({ type: 'deliver/SET_LAYOUT_MODE', layoutMode: value })}
          />
          <Text style={[styles.helperText, { color: tokens.muted }]}>
            {layoutMode === '2_in_1'
              ? 'Eco-Save (2 Pages per Sheet - Side-by-Side): fewer sheets to print, PDF only.'
              : 'Standard (1 Page per Sheet).'}
          </Text>
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
          exportCopy={
            Platform.OS === 'android'
              ? {
                  enabled: exportCopy,
                  onToggle: () => dispatch({ type: 'deliver/TOGGLE_EXPORT_COPY' }),
                  folderLabel: androidExportFolderLabel,
                  onSetup: () => go('settings'),
                }
              : undefined
          }
        />

        <Pressable
          style={[styles.saveToRow, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
          onPress={() => setFolderPickerOpen(true)}
        >
          <Text style={{ color: tokens.ink, fontSize: 15 }}>Course</Text>
          <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>{courseName}</Text>
        </Pressable>

        <Pressable
          style={[styles.saveToRow, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
          onPress={() => go('academicOptions')}
        >
          <Text style={{ color: tokens.ink, fontSize: 15 }}>Academic export</Text>
          <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>
            {summarizeAcademicConfig(academicConfig)}
          </Text>
        </Pressable>
      </ScrollView>

      <StickyActions
        saving={saving}
        progress={progress}
        onSave={() => handleSaveInternal(false)}
        onSaveShare={() => handleSaveInternal(true)}
      />

      <FolderPickerModal
        visible={folderPickerOpen}
        courses={courses}
        selectedCourseId={courseId}
        onSelect={(id) => dispatch({ type: 'deliver/SET_COURSE', courseId: id })}
        onCreate={handleCreateCourse}
        onClose={() => setFolderPickerOpen(false)}
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
  helperText: {
    marginTop: spacing.xs,
    fontSize: 13,
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
