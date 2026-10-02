import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoverThumbnail } from '../components/deliver/CoverThumbnail';
import { NameField } from '../components/deliver/NameField';
import { SegmentedControl } from '../components/shared/SegmentedControl';
import { t } from '../i18n';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { DEFAULT_ADJUST } from '../services/enhance/adjust';
import { renderPage } from '../services/enhance/skiaEnhance';
import { exportPreset } from '../services/capture/imageSpec';
import { buildPdfFromPages, fillPageNumbers } from '../services/pdf/pdfService';
import type { AcademicConfig } from '../services/pdf/pdfService';
import {
  COVER_FIELD_LABELS,
  COVER_TEMPLATES,
  getCoverTemplate,
  resolveCoverValues,
  type CoverPageConfig,
  type CoverTemplateId,
  type CoverValues,
} from '../services/pdf/coverTemplates';
import { useCoverDefaults, useNamingContext, useResolvedAcademicConfig } from '../store/useDeliverContext';
import { footerPresetOf, footerPresetText, type FooterPreset } from '../services/submit/footerPresets';
import { renderText } from '../services/submit/naming';
import { cleanTemporaryCache, deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, radii, spacing, typeScale, useTheme } from '../theme';
import { createId } from '../utils/id';

type CoverMode = CoverPageConfig['mode'] | 'none';

// Built per render (in the active language).
const footerSegments = (): { id: FooterPreset; label: string }[] => [
  { id: 'none', label: t('deliver.academic.footerModes.none') },
  { id: 'pages', label: t('deliver.academic.footerModes.pages') },
  { id: 'namePages', label: t('deliver.academic.footerModes.namePages') },
  { id: 'custom', label: t('deliver.academic.footerModes.custom') },
];

const coverSegments = (): { id: CoverMode; label: string }[] => [
  { id: 'none', label: t('deliver.academic.coverModes.none') },
  { id: 'template', label: t('deliver.academic.coverModes.template') },
  { id: 'imported_image', label: t('deliver.academic.coverModes.photo') },
];

export function summarizeAcademicConfig(cfg: AcademicConfig | null): string {
  if (!cfg) return t('deliver.academic.off');
  const parts: string[] = [];
  if (cfg.coverPage) parts.push(t('deliver.academic.coverPage'));
  if (cfg.enableBorder) parts.push(t('deliver.academic.border'));
  if (cfg.headerText || cfg.footerText) parts.push(t('deliver.academic.headerFooter'));
  return parts.length > 0 ? parts.join(' · ') : t('deliver.academic.off');
}

type FieldState = {
  enableBorder: boolean;
  headerText: string;
  footerText: string;
  coverMode: CoverMode;
  templateId: CoverTemplateId;
  // Only the fields the student changed; the rest come from useCoverDefaults.
  coverValues: CoverValues;
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
        ? { mode: 'template', templateId: next.templateId, values: next.coverValues }
        : { mode: 'imported_image', importedUri: next.importedUri };

  const headerText = next.headerText.trim() || undefined;
  const footerText = next.footerText.trim() || undefined;

  if (!next.enableBorder && !headerText && !footerText && !coverPage) return null;
  return { enableBorder: next.enableBorder, headerText, footerText, coverPage };
}

export function AcademicOptionsScreen() {
  const { tokens } = useTheme();
  // t is imported (the module-level helpers use it too); this re-renders on a language change.
  useT();
  const { go, previousScreen } = useRouter();
  const { state, dispatch } = useAppState();
  const cfg = state.deliver.academicConfig;
  const [previewing, setPreviewing] = useState(false);

  const enableBorder = cfg?.enableBorder ?? false;
  const headerText = cfg?.headerText ?? '';
  const footerText = cfg?.footerText ?? '';
  const coverMode: CoverMode = cfg?.coverPage?.mode ?? 'none';
  const cover = cfg?.coverPage;
  // Kept while switching to Photo and back, so edits to the template fields aren't lost.
  const [lastTemplate, setLastTemplate] = useState<{ templateId: CoverTemplateId; coverValues: CoverValues }>({
    templateId: 'assignment',
    coverValues: {},
  });
  const templateId = cover?.mode === 'template' ? cover.templateId : lastTemplate.templateId;
  const coverValues = cover?.mode === 'template' ? cover.values : lastTemplate.coverValues;
  const importedUri = cover?.mode === 'imported_image' ? cover.importedUri : undefined;
  const coverDefaults = useCoverDefaults();
  const shownValues = resolveCoverValues(coverDefaults, coverValues);
  // What gets drawn: the stored edits on top of the defaults (Deliver does the same).
  const resolvedCfg = useResolvedAcademicConfig();
  const namingContext = useNamingContext();
  // Custom stays selected while its text happens to match a preset (e.g. right after choosing it).
  const [footerMode, setFooterMode] = useState<FooterPreset>(() => footerPresetOf(footerText));
  const pageCount = state.capture.pages.length;
  // The footer on the first content page, tokens and page numbers filled in.
  const footerSample = footerText ? fillPageNumbers(renderText(footerText, namingContext), 1, Math.max(1, pageCount)) : '';

  const commit = useCallback(
    (patch: Partial<FieldState>) => {
      const config = buildConfig({
        enableBorder,
        headerText,
        footerText,
        coverMode,
        templateId,
        coverValues,
        importedUri,
        ...patch,
      });
      if (patch.templateId || patch.coverValues) {
        setLastTemplate({ templateId: patch.templateId ?? templateId, coverValues: patch.coverValues ?? coverValues });
      }
      dispatch({ type: 'deliver/SET_ACADEMIC_CONFIG', config });
    },
    [enableBorder, headerText, footerText, coverMode, templateId, coverValues, importedUri, dispatch]
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
      // Same single-pass render Deliver uses, one page at a time, straight to the export preset.
      const preset = exportPreset(state.deliver.quality);
      const bakedPages: { uri: string; width: number; height: number }[] = [];
      for (const page of pages) {
        const edits = {
          rotation: page.rotation,
          enhance: page.enhance,
          adjust: page.adjust ?? DEFAULT_ADJUST,
          stats: page.stats,
          filterOptions: page.filterOptions,
        };
        bakedPages.push(await renderPage(page.uri, edits, preset));
      }

      const result = await buildPdfFromPages(
        previewId,
        bakedPages,
        'as-is',
        resolvedCfg ?? undefined,
        state.deliver.layoutMode,
        state.deliver.pageSize
      );
      await Print.printAsync({ uri: result.uri });
      lastPreviewIdRef.current = previewId;

      cleanTemporaryCache(bakedPages.map((page) => page.uri));
    } catch (error) {
      console.warn('AcademicOptionsScreen: preview failed', error);
      deleteDocumentFiles(previewId);
    } finally {
      setPreviewing(false);
    }
  }, [pages, previewing, state.deliver.quality, state.deliver.layoutMode, state.deliver.pageSize, resolvedCfg]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go(previousScreen ?? 'deliver', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
          <Text style={[styles.headerButtonLabel, { color: tokens.ink }]}>{t('common.back')}</Text>
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('deliver.academic.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <View style={styles.rowTextWrap}>
            <Text style={[styles.rowLabel, { color: tokens.ink }]}>{t('deliver.academic.borderRow')}</Text>
            <Text style={[styles.disclosure, { color: tokens.muted }]}>{t('deliver.academic.borderHint')}</Text>
          </View>
          <Switch
            value={enableBorder}
            onValueChange={(value) => commit({ enableBorder: value })}
            trackColor={{ true: tokens.accent, false: tokens.surface2 }}
          />
        </View>

        <NameField
          label={t('deliver.academic.header')}
          value={headerText}
          onChange={(value) => commit({ headerText: value })}
          placeholder={t('deliver.academic.headerPlaceholder')}
          helperText={t('deliver.academic.headerHint')}
        />

        <View style={styles.footerSection}>
          <Text style={[styles.sectionLabel, { color: tokens.ink }]}>{t('deliver.academic.footer')}</Text>
          <SegmentedControl
            segments={footerSegments()}
            value={footerMode}
            onChange={(mode) => {
              setFooterMode(mode);
              if (mode === 'none') commit({ footerText: '' });
              else if (mode !== 'custom') commit({ footerText: footerPresetText(mode) });
            }}
          />
          {footerMode === 'custom' && (
            <NameField
              label={t('deliver.academic.footerText')}
              value={footerText}
              onChange={(value) => commit({ footerText: value })}
              placeholder={t('deliver.academic.footerPlaceholder')}
              helperText={t('deliver.academic.footerHint')}
            />
          )}
          {footerSample ? (
            <Text style={[styles.disclosure, { color: tokens.muted }]}>{t('deliver.academic.footerSample', { text: footerSample })}</Text>
          ) : null}
        </View>

        <View>
          <Text style={[styles.sectionLabel, { color: tokens.ink }]}>{t('deliver.academic.coverPage')}</Text>
          <SegmentedControl
            segments={coverSegments()}
            value={coverMode}
            onChange={(value) => commit({ coverMode: value })}
          />
        </View>

        {coverMode === 'template' && (
          <>
            <View style={styles.templateRow}>
              {COVER_TEMPLATES.map((template) => {
                const selected = template.id === templateId;
                return (
                  <Pressable
                    key={template.id}
                    style={styles.templateOption}
                    onPress={() => commit({ templateId: template.id })}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t('deliver.academic.templateA11y', { template: t(template.labelKey) })}
                  >
                    <View style={[styles.templateFrame, { borderColor: selected ? tokens.accent : 'transparent' }]}>
                      <CoverThumbnail templateId={template.id} values={shownValues} width={92} />
                    </View>
                    <Text style={[styles.templateLabel, { color: selected ? tokens.accentInk : tokens.ink }]}>{t(template.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.disclosure, { color: tokens.muted }]}>{t('deliver.academic.templateHint')}</Text>
            {getCoverTemplate(templateId).fields.map((key) => (
              <NameField
                key={key}
                label={t(COVER_FIELD_LABELS[key])}
                value={shownValues[key] ?? ''}
                onChange={(value) => commit({ coverValues: { ...coverValues, [key]: value } })}
                placeholder={t(COVER_FIELD_LABELS[key])}
              />
            ))}
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
                <Text style={{ color: tokens.muted, fontSize: 13 }}>{t('deliver.academic.noPhoto')}</Text>
              </View>
            )}
            <Pressable
              style={[styles.pickButton, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
              onPress={handlePickCoverImage}
            >
              <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>
                {importedUri ? t('deliver.academic.chooseOtherPhoto') : t('deliver.academic.choosePhoto')}
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
            <Text style={styles.previewButtonLabel}>{t('deliver.academic.preview')}</Text>
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
  templateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  templateOption: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  templateFrame: {
    padding: 3,
    borderWidth: 2,
    borderRadius: radii.chip,
  },
  templateLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerSection: {
    gap: spacing.sm,
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
