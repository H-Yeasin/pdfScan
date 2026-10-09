import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoverThumbnail } from '../components/deliver/CoverThumbnail';
import { ProBadge } from '../components/pro/ProBadge';
import { useOfferPro } from '../components/pro/useOfferPro';
import { useIsPro } from '../services/pro/entitlement';
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
import { defaultPageSize } from '../services/pdf/pageSize';
import { pdfPageCount } from '../services/documents/pageMap';
import { buildCoverPreview } from '../services/persistence/addCover';
import { defaultSubmitPreset, presetAcademicConfig, type SubmitPreset } from '../services/submit/preset';
import { useApplyCover } from '../components/library/useCoverTarget';
import {
  COVER_FIELD_LABELS,
  COVER_TEMPLATES,
  coverTemplateFor,
  getCoverTemplate,
  resolveCoverValues,
  type CoverPageConfig,
  type CoverTemplateId,
  type CoverValues,
} from '../services/pdf/coverTemplates';
import {
  resolveAcademicConfig,
  useCoverDefaults,
  useDocumentNamingContext,
  useNamingContext,
  useResolvedAcademicConfig,
} from '../store/useDeliverContext';
import { footerPresetOf, footerPresetText, type FooterPreset } from '../services/submit/footerPresets';
import { renderText } from '../services/submit/naming';
import { cleanTemporaryCache, deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { useAppDispatch, useAppSlices } from '../store/AppStateContext';
import { fontFamily, radii, spacing, typeScale, useTheme, touchSlop } from '../theme';
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

// §14 Q7: where a library document's cover starts - its course's preset (border, footer, cover
// template), the same defaults Deliver starts a scan for that course from - with a cover always
// on, since a cover is what the student came for.
export function initialCoverTargetConfig(preset: SubmitPreset): AcademicConfig {
  const fromPreset = presetAcademicConfig(preset);
  return {
    enableBorder: fromPreset?.enableBorder ?? false,
    footerText: fromPreset?.footerText,
    coverPage: fromPreset?.coverPage ?? { mode: 'template', templateId: 'assignment', values: {} },
  };
}

// Edits deliver.academicConfig for the scan session (from Review or Deliver) - or, in §14 Q7's
// target mode (deliver.coverTarget, from the Selection bar or the Reader), a config of its own for
// a library PDF, which Apply puts on that document as a copy or in place.
export function AcademicOptionsScreen() {
  const { tokens } = useTheme();
  // t is imported (the module-level helpers use it too); this re-renders on a language change.
  useT();
  const { back } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('capture', 'deliver', 'library');
  const coverTarget = state.deliver.coverTarget;
  const targetDoc = coverTarget ? state.library.files.find((f) => f.id === coverTarget.docId) : undefined;
  const targetCourse = targetDoc?.courseId ? state.library.courses.find((c) => c.id === targetDoc.courseId) : undefined;
  const targetCourseId = targetDoc?.courseId ?? null;
  const targetPreset = useMemo(() => targetCourse?.submitPreset ?? defaultSubmitPreset(targetCourseId), [targetCourse, targetCourseId]);
  // Target mode never touches the scan session's options.
  const storedTargetCfg = coverTarget?.config;
  const targetCfg = useMemo(
    () => (storedTargetCfg === undefined ? initialCoverTargetConfig(targetPreset) : storedTargetCfg),
    [storedTargetCfg, targetPreset]
  );
  const cfg = targetDoc ? targetCfg : state.deliver.academicConfig;
  const setConfig = useCallback(
    (config: AcademicConfig | null) =>
      dispatch(targetDoc ? { type: 'deliver/SET_COVER_TARGET_CONFIG', config } : { type: 'deliver/SET_ACADEMIC_CONFIG', config }),
    [targetDoc, dispatch]
  );
  // The document's PDF keeps its paper; a scan saved before sizes were stored gets its course's.
  const targetPageSize = targetDoc?.pdfPageSize ?? targetPreset.pageSize ?? defaultPageSize();
  const coverRun = useApplyCover(coverTarget, targetDoc);
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
  const isPro = useIsPro();
  const offerPro = useOfferPro();
  // A Pro template stored while Pro was active (a course preset) shows as the free template it is
  // drawn with now (§10 M4); choosing it again needs Pro.
  const templateId = coverTemplateFor(cover?.mode === 'template' ? cover.templateId : lastTemplate.templateId, isPro);
  const coverValues = cover?.mode === 'template' ? cover.values : lastTemplate.coverValues;
  const importedUri = cover?.mode === 'imported_image' ? cover.importedUri : undefined;
  const documentContext = useDocumentNamingContext(targetDoc);
  const coverDefaults = useCoverDefaults(documentContext);
  const shownValues = resolveCoverValues(coverDefaults, coverValues);
  // What gets drawn: the stored edits on top of the defaults (Deliver does the same).
  const sessionResolved = useResolvedAcademicConfig();
  const sessionContext = useNamingContext();
  const namingContext = documentContext ?? sessionContext;
  const resolvedCfg = useMemo(
    () => (documentContext ? resolveAcademicConfig(targetCfg, documentContext, coverDefaults, isPro) : sessionResolved),
    [documentContext, targetCfg, coverDefaults, isPro, sessionResolved]
  );
  // Custom stays selected while its text happens to match a preset (e.g. right after choosing it).
  const [footerMode, setFooterMode] = useState<FooterPreset>(() => footerPresetOf(footerText));
  // The content pages the footer numbers: the session's, or the document's without its old cover.
  const pageCount = targetDoc ? pdfPageCount(targetDoc) - (targetDoc.coverKind ? 1 : 0) : state.capture.pages.length;
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
      setConfig(config);
    },
    [enableBorder, headerText, footerText, coverMode, templateId, coverValues, importedUri, setConfig]
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
    if ((!targetDoc && pages.length === 0) || previewing) return;
    setPreviewing(true);
    if (lastPreviewIdRef.current) {
      deleteDocumentFiles(lastPreviewIdRef.current);
      lastPreviewIdRef.current = null;
    }
    const previewId = createId('preview');
    try {
      // §14 Q7: the library document's first page behind the cover, not the session's pages.
      if (targetDoc) {
        const uri = await buildCoverPreview(targetDoc, resolvedCfg ?? { enableBorder: false }, targetPageSize, previewId);
        await Print.printAsync({ uri });
        lastPreviewIdRef.current = previewId;
        return;
      }
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
  }, [pages, previewing, state.deliver.quality, state.deliver.layoutMode, state.deliver.pageSize, resolvedCfg, targetDoc, targetPageSize]);

  // §14 Q7: the owner's choice - a copy next to the original, or the document itself.
  const canApply = coverMode === 'template' || (coverMode === 'imported_image' && !!importedUri);
  const { apply } = coverRun;
  const handleApply = useCallback(() => {
    if (!targetDoc || !resolvedCfg?.coverPage) return;
    const run = (mode: 'copy' | 'replace') => apply(resolvedCfg, targetPageSize, mode);
    Alert.alert(
      t('library.cover.saveTitle'),
      `${t('library.cover.saveCopyHint', { name: targetDoc.name })}\n\n${t('library.cover.replaceHint')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('library.cover.replace'), onPress: () => run('replace') },
        { text: t('library.cover.saveCopy'), onPress: () => run('copy') },
      ]
    );
  }, [targetDoc, resolvedCfg, targetPageSize, apply]);

  const handleBack = useCallback(() => {
    if (coverTarget) coverRun.leave();
    else back();
  }, [coverTarget, coverRun, back]);

  const coverSection = (
    <>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>
              {COVER_TEMPLATES.map((template) => {
                const selected = template.id === templateId;
                const locked = template.pro && !isPro;
                return (
                  <Pressable
                    key={template.id}
                    style={styles.templateOption}
                    onPress={() => (locked ? offerPro('coverTemplates') : commit({ templateId: template.id }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t('deliver.academic.templateA11y', { template: t(template.labelKey) })}
                    accessibilityHint={locked ? t('pro.badgeLabel') : undefined}
                  >
                    <View style={[styles.templateFrame, { borderColor: selected ? tokens.accent : 'transparent' }]}>
                      <CoverThumbnail templateId={template.id} values={shownValues} width={92} />
                    </View>
                    <Text style={[styles.templateLabel, { color: selected ? tokens.accentInk : tokens.ink }]}>{t(template.labelKey)}</Text>
                    {locked ? <ProBadge /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
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
            <Pressable accessibilityRole="button"
              style={[styles.pickButton, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
              onPress={handlePickCoverImage}
            >
              <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>
                {importedUri ? t('deliver.academic.chooseOtherPhoto') : t('deliver.academic.choosePhoto')}
              </Text>
            </Pressable>
          </View>
        )}

    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
          <Text style={[styles.headerButtonLabel, { color: tokens.ink }]}>{t('common.back')}</Text>
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('deliver.academic.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* §14 Q7: for a library document the cover is what it's for, so it comes first. */}
        {targetDoc ? coverSection : null}
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

        {targetDoc ? null : coverSection}

        <Pressable accessibilityRole="button"
          style={[
            styles.previewButton,
            targetDoc
              ? { backgroundColor: tokens.surface, borderColor: tokens.edge, borderWidth: StyleSheet.hairlineWidth }
              : { backgroundColor: tokens.accent },
            { opacity: previewing ? 0.7 : 1 },
          ]}
          onPress={handlePreview}
          disabled={previewing || (!targetDoc && pages.length === 0)}
        >
          {previewing ? (
            <ActivityIndicator color={targetDoc ? tokens.accent : tokens.onAccent} />
          ) : (
            <Text style={[styles.previewButtonLabel, { color: targetDoc ? tokens.accentInk : tokens.onAccent }]}>{t('deliver.academic.preview')}</Text>
          )}
        </Pressable>

        {targetDoc ? (
          <Pressable
            accessibilityRole="button"
            testID="cover-apply"
            style={[styles.previewButton, { backgroundColor: tokens.accent, opacity: canApply ? 1 : 0.38 }]}
            onPress={handleApply}
            disabled={!canApply || coverRun.busy}
            accessibilityState={{ disabled: !canApply || coverRun.busy }}
          >
            <Text style={[styles.previewButtonLabel, { color: tokens.onAccent }]}>{t('library.cover.apply')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {coverRun.busy ? (
        <View style={[styles.busy, { backgroundColor: tokens.bg }]} accessibilityLiveRegion="polite">
          <ActivityIndicator color={tokens.accent} size="large" />
          <Text style={[styles.busyLabel, { color: tokens.ink }]}>{t('library.cover.adding')}</Text>
        </View>
      ) : null}
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
    gap: spacing.md,
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
    fontSize: 15,
    fontWeight: '700',
  },
  busy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    opacity: 0.94,
  },
  busyLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
