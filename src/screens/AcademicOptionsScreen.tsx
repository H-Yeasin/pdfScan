import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NameField } from '../components/deliver/NameField';
import { SegmentedControl } from '../components/shared/SegmentedControl';
import { useRouter } from '../navigation/router';
import { DEFAULT_ADJUST } from '../services/enhance/adjust';
import { bakeEnhance } from '../services/enhance/skiaEnhance';
import { buildPdfFromPages } from '../services/pdf/pdfService';
import type { AcademicConfig, CoverPageConfig } from '../services/pdf/pdfService';
import { cleanTemporaryCache, deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, radii, spacing, typeScale, useTheme } from '../theme';
import { createId } from '../utils/id';

type CoverMode = CoverPageConfig['mode'] | 'none';

const COVER_SEGMENTS: { id: CoverMode; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'template', label: 'Template' },
  { id: 'imported_image', label: 'Photo' },
];

export function summarizeAcademicConfig(cfg: AcademicConfig | null): string {
  if (!cfg) return 'Off';
  const parts: string[] = [];
  if (cfg.coverPage) parts.push('Cover page');
  if (cfg.enableBorder) parts.push('Border');
  if (cfg.headerText || cfg.footerText) parts.push('Header/footer');
  return parts.length > 0 ? parts.join(' · ') : 'Off';
}

type FieldState = {
  enableBorder: boolean;
  headerText: string;
  footerText: string;
  coverMode: CoverMode;
  title: string;
  studentName: string;
  courseCode: string;
  importedUri?: string;
};

// Collapses the screen's flat field state back into the AcademicConfig|null shape the reducer
// and buildPdfFromPages expect - null once every option is back at its default, so the "off" case
// stays a cheap no-op rather than an object full of empty strings.
function buildConfig(next: FieldState): AcademicConfig | null {
  const coverPage: CoverPageConfig | undefined =
    next.coverMode === 'none'
      ? undefined
      : next.coverMode === 'template'
        ? {
            mode: 'template',
            title: next.title.trim() || undefined,
            studentName: next.studentName.trim() || undefined,
            courseCode: next.courseCode.trim() || undefined,
          }
        : { mode: 'imported_image', importedUri: next.importedUri };

  const headerText = next.headerText.trim() || undefined;
  const footerText = next.footerText.trim() || undefined;

  if (!next.enableBorder && !headerText && !footerText && !coverPage) return null;
  return { enableBorder: next.enableBorder, headerText, footerText, coverPage };
}

export function AcademicOptionsScreen() {
  const { tokens } = useTheme();
  const { go, previousScreen } = useRouter();
  const { state, dispatch } = useAppState();
  const cfg = state.deliver.academicConfig;
  const [previewing, setPreviewing] = useState(false);

  const enableBorder = cfg?.enableBorder ?? false;
  const headerText = cfg?.headerText ?? '';
  const footerText = cfg?.footerText ?? '';
  const coverMode: CoverMode = cfg?.coverPage?.mode ?? 'none';
  const title = cfg?.coverPage?.title ?? '';
  const studentName = cfg?.coverPage?.studentName ?? '';
  const courseCode = cfg?.coverPage?.courseCode ?? '';
  const importedUri = cfg?.coverPage?.importedUri;

  const commit = useCallback(
    (patch: Partial<FieldState>) => {
      const config = buildConfig({
        enableBorder,
        headerText,
        footerText,
        coverMode,
        title,
        studentName,
        courseCode,
        importedUri,
        ...patch,
      });
      dispatch({ type: 'deliver/SET_ACADEMIC_CONFIG', config });
    },
    [enableBorder, headerText, footerText, coverMode, title, studentName, courseCode, importedUri, dispatch]
  );

  const handlePickCoverImage = useCallback(async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || result.assets.length === 0) return;

    commit({ coverMode: 'imported_image', importedUri: result.assets[0].uri });
  }, [commit]);

  const pages = state.capture.pages;

  // Builds a scratch PDF with the CURRENT (uncommitted-to-library) academic settings and current
  // session pages, then hands it to expo-print - on both iOS and Android this opens a native
  // preview/print sheet rendering the real PDF, cover page/border/header-footer included, so the
  // user can see exactly what export will produce before saving anything. Nothing here touches
  // the library.
  //
  // On Android, printAsync's promise resolves once the print job is handed off, but the OS print
  // spooler (PrintDocumentAdapter) reads the file lazily afterwards - deleting the scratch dir
  // right away races with that read and crashes the spooler with CannotLoadUriException. So the
  // previous preview's scratch dir is only cleaned up lazily, once a new preview starts (or on
  // unmount), by which point the spooler is done with it.
  const lastPreviewIdRef = useRef<string | null>(null);

  const handlePreview = useCallback(async () => {
    if (pages.length === 0 || previewing) return;
    setPreviewing(true);
    if (lastPreviewIdRef.current) {
      deleteDocumentFiles(lastPreviewIdRef.current);
      lastPreviewIdRef.current = null;
    }
    const previewId = createId('preview');
    try {
      const bakedPages = await Promise.all(
        pages.map(async (page) => {
          const baked = await bakeEnhance(page.uri, page.enhance, page.adjust ?? DEFAULT_ADJUST);
          return { ...page, ...baked };
        })
      );

      const result = await buildPdfFromPages(
        previewId,
        bakedPages,
        state.deliver.quality,
        cfg ?? undefined,
        state.settings.ocrScript
      );
      await Print.printAsync({ uri: result.uri });
      lastPreviewIdRef.current = previewId;

      const staleCacheUris = bakedPages
        .filter((page, i) => page.uri !== pages[i].uri)
        .map((page) => page.uri);
      cleanTemporaryCache(staleCacheUris);
    } catch (error) {
      console.warn('AcademicOptionsScreen: preview failed', error);
      deleteDocumentFiles(previewId);
    } finally {
      setPreviewing(false);
    }
  }, [pages, previewing, state.deliver.quality, state.settings.ocrScript, cfg]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go(previousScreen ?? 'deliver', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
          <Text style={[styles.headerButtonLabel, { color: tokens.ink }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Academic export</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <View style={styles.rowTextWrap}>
            <Text style={[styles.rowLabel, { color: tokens.ink }]}>Geometric border</Text>
            <Text style={[styles.disclosure, { color: tokens.muted }]}>
              Draws a thin inset rectangle on every content page.
            </Text>
          </View>
          <Switch
            value={enableBorder}
            onValueChange={(value) => commit({ enableBorder: value })}
            trackColor={{ true: tokens.accent, false: tokens.surface2 }}
          />
        </View>

        <NameField
          label="Header text"
          value={headerText}
          onChange={(value) => commit({ headerText: value })}
          placeholder="e.g. CS 101 — Assignment 3"
        />
        <NameField
          label="Footer text"
          value={footerText}
          onChange={(value) => commit({ footerText: value })}
          placeholder="e.g. Page {X} of {Y}"
          helperText='Use {X} and {Y} for the current and total content-page numbers (the cover page is not counted).'
        />

        <View>
          <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Cover page</Text>
          <SegmentedControl
            segments={COVER_SEGMENTS}
            value={coverMode}
            onChange={(value) => commit({ coverMode: value })}
          />
        </View>

        {coverMode === 'template' && (
          <>
            <NameField label="Title" value={title} onChange={(value) => commit({ title: value })} placeholder="Assignment title" />
            <NameField
              label="Student name"
              value={studentName}
              onChange={(value) => commit({ studentName: value })}
              placeholder="Your name"
            />
            <NameField
              label="Course code"
              value={courseCode}
              onChange={(value) => commit({ courseCode: value })}
              placeholder="e.g. CS 101"
            />
          </>
        )}

        {coverMode === 'imported_image' && (
          <View style={styles.coverImageSection}>
            {importedUri ? (
              <Image source={{ uri: importedUri }} style={[styles.coverPreview, { borderColor: tokens.edge }]} />
            ) : (
              <View
                style={[
                  styles.coverPreview,
                  styles.coverPreviewEmpty,
                  { borderColor: tokens.edge, backgroundColor: tokens.surface },
                ]}
              >
                <Text style={{ color: tokens.muted, fontSize: 13 }}>No photo selected</Text>
              </View>
            )}
            <Pressable
              style={[styles.pickButton, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
              onPress={handlePickCoverImage}
            >
              <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>
                {importedUri ? 'Choose a different photo' : 'Choose photo'}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.previewButton, { backgroundColor: tokens.accent, opacity: previewing ? 0.7 : 1 }]}
          onPress={handlePreview}
          disabled={previewing || pages.length === 0}
        >
          {previewing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.previewButtonLabel}>Preview PDF</Text>
          )}
        </Pressable>
      </ScrollView>
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
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowTextWrap: {
    flex: 1,
    gap: 4,
  },
  rowLabel: {
    fontSize: 15,
  },
  disclosure: {
    fontSize: 12,
    lineHeight: 16,
  },
  coverImageSection: {
    gap: spacing.md,
  },
  coverPreview: {
    width: '100%',
    height: 160,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverPreviewEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewButton: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
  previewButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
