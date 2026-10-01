import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FolderPickerModal } from '../components/deliver/FolderPickerModal';
import { FormatSegmented } from '../components/deliver/FormatSegmented';
import { LayoutModeSegmented } from '../components/deliver/LayoutModeSegmented';
import { MoreOptionsPanel } from '../components/deliver/MoreOptionsPanel';
import { NameField } from '../components/deliver/NameField';
import { QualitySlider } from '../components/deliver/QualitySlider';
import { SizeTargetRow } from '../components/deliver/SizeTargetRow';
import { StickyActions } from '../components/deliver/StickyActions';
import { ProfilePromptSheet } from '../components/deliver/ProfilePromptSheet';
import { SegmentedControl } from '../components/shared/SegmentedControl';
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
import { shareAs, shareDocument } from '../services/sharing/shareService';
import { historyUris } from '../store/pageHistory';
import { CourseChips } from '../components/courses/CourseChips';
import { DocTypeSelector } from '../components/courses/DocTypeChips';
import { getCaptureModeSpec } from '../services/capture/captureModes';
import { defaultDocTypeFor, typeNumberOf } from '../services/courses/docTypes';
import { suggestName } from '../services/submit/naming';
import { defaultSubmitPreset, presetFromDeliver, presetsEqual, summarizePreset } from '../services/submit/preset';
import { isProfileComplete } from '../services/submit/profile';
import { submitDocument, type SubmitResult } from '../services/submit/submitDocument';
import { submissionRecord } from '../services/submit/history';
import { matchDeadline } from '../services/submit/deadlines';
import type { Submission } from '../types/models';
import type { PageSizeId } from '../services/pdf/pageSize';
import { buildPdfUnderLimit, formatLimit, tooLargeMessage } from '../services/submit/sizeTarget';
import { useAppState } from '../store/AppStateContext';
import { useNamingContext, useResolvedAcademicConfig } from '../store/useDeliverContext';
import { useFilingCourse } from '../store/useFilingCourse';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';
import type { LibraryDocument, LibraryPage, PageLayout, PageOcr } from '../types/models';
import { formatBytes } from '../utils/format';
import { createId } from '../utils/id';

const PAGE_SIZE_SEGMENTS: { id: PageSizeId; label: string }[] = [
  { id: 'A4', label: 'A4' },
  { id: 'Letter', label: 'Letter' },
];

type SaveMode = 'save' | 'share' | 'submit';

function defaultName(): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  return `Scan_${iso}`;
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
  layout?: PageLayout;
};

export function DeliverScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { pages } = state.capture;
  const { name, nameEdited, format, quality, sizeLimitBytes, more, exportCopy, layoutMode, pageSize } = state.deliver;
  // The academic options as they will be drawn: cover defaults and header/footer tokens filled in.
  const academicConfig = useResolvedAcademicConfig();
  const namingContext = useNamingContext();
  // The size target is for the PDF; a JPG export saves each page as its own image.
  const sizeLimit = format === 'PDF' ? sizeLimitBytes : null;
  // The picked course, or the top suggestion (timetable, last used, ...) until the student picks.
  const { courseId, suggestions, automatic } = useFilingCourse();
  // Every saved document gets a type: the student's pick, or the capture mode's default.
  const docType = state.deliver.docType ?? defaultDocTypeFor(getCaptureModeSpec(state.capture.mode));
  const { courses } = state.library;
  const { androidExportFolderUri, androidExportFolderLabel, ocrScript, profile, profilePrompted } = state.settings;
  const { presetCourseId, rememberPreset } = state.deliver;
  // The course's own file-name template, if its preset has one, else the Settings one.
  const nameTemplate = state.deliver.nameTemplate ?? state.settings.nameTemplate;
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [profilePromptOpen, setProfilePromptOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // §4 S6: the filing course's submit preset becomes the options whenever the course changes
  // (Unsorted and courses without one get the default), and while "Remember" is on every change
  // to them is saved back to the course, so the next scan for it is already set up.
  const course = useMemo(() => courses.find((c) => c.id === courseId), [courses, courseId]);
  const coursePreset = useMemo(() => course?.submitPreset ?? defaultSubmitPreset(courseId), [course, courseId]);
  useEffect(() => {
    if (presetCourseId === courseId) return;
    dispatch({ type: 'deliver/APPLY_PRESET', courseId, preset: coursePreset });
  }, [presetCourseId, courseId, coursePreset, dispatch]);

  const currentPreset = useMemo(
    () =>
      presetFromDeliver({
        sizeLimitBytes,
        academicConfig: state.deliver.academicConfig,
        pageSize,
        layoutMode,
        nameTemplate: state.deliver.nameTemplate,
        includeAnnotations: state.deliver.includeAnnotations,
      }, coursePreset),
    [sizeLimitBytes, state.deliver.academicConfig, pageSize, layoutMode, state.deliver.nameTemplate, state.deliver.includeAnnotations, coursePreset]
  );
  useEffect(() => {
    if (!rememberPreset || !course || presetCourseId !== course.id) return;
    if (presetsEqual(currentPreset, coursePreset)) return;
    dispatch({ type: 'library/UPDATE_COURSE', id: course.id, patch: { submitPreset: currentPreset } });
  }, [rememberPreset, course, presetCourseId, currentPreset, coursePreset, dispatch]);

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

  // The name from the naming template (e.g. 2021331045_Rahim_CSE101_HW3). It follows the course
  // and type, since `{n}` counts per course and type, until the student types a name of their own.
  const suggestedName = useMemo(() => suggestName(nameTemplate, namingContext) || defaultName(), [nameTemplate, namingContext]);

  useEffect(() => {
    if (nameEdited || pages.length === 0 || name === suggestedName) return;
    dispatch({ type: 'deliver/SET_AUTO_NAME', name: suggestedName });
  }, [name, nameEdited, suggestedName, pages.length, dispatch]);

  const sizeEstimate = useMemo(() => estimateSizeBytes(pages, quality), [pages, quality]);

  const handleSaveInternal = useCallback(
    async (mode: SaveMode) => {
      if (pages.length === 0 || saving) return;
      const shareAfter = mode === 'share';
      setSaving(true);
      try {
        const documentId = createId('doc');
        // Submit fits the separate submission file to the limit, so the library copy is built at
        // the library quality instead of being fitted twice.
        const librarySizeLimit = mode === 'submit' ? null : sizeLimit;
        // With a size target the level isn't known until every master exists, so the loop renders
        // masters only and buildPdfUnderLimit encodes the PDF's pages itself.
        const encoding = librarySizeLimit !== null ? 'as-is' : encodingForQuality(quality);
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
          const edits = {
            rotation: page.rotation,
            enhance: page.enhance,
            adjust: page.adjust ?? DEFAULT_ADJUST,
            stats: page.stats,
            filterOptions: page.filterOptions,
          };
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
            layout: page.layout,
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
            const rendered = await renderCoverPageImage(academicConfig.coverPage, pageSize);
            if (rendered) {
              coverPage = {
                id: createId('page'),
                masterUri: rendered.uri,
                width: rendered.width,
                height: rendered.height,
                // An imported cover is the user's own picked file - copy it, don't move it.
                keepSource: academicConfig.coverPage.mode === 'imported_image' && rendered.uri === academicConfig.coverPage.importedUri,
              };
            }
          }
        }

        // Always build a document.pdf, regardless of the chosen export `format` - the unified
        // reader renders every library doc through the real PDF engine, so a JPG-format doc needs
        // a real PDF behind it too. Pages are already encoded for export, so they go in as-is.
        const pdfPages = contentPages.map((p) => ({ uri: p.exportUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout }));
        let pdfResult: { uri: string; sizeBytes: number };
        let sizeWarning: string | null = null;
        if (librarySizeLimit !== null) {
          setProgress(`Fitting under ${formatLimit(librarySizeLimit)}…`);
          const sized = await buildPdfUnderLimit(documentId, pdfPages, librarySizeLimit, academicConfig ?? undefined, layoutMode, pageSize);
          if (!sized.fits) sizeWarning = tooLargeMessage(sized, librarySizeLimit);
          pdfResult = sized;
        } else {
          setProgress('Building PDF…');
          pdfResult = await buildPdfFromPages(documentId, pdfPages, 'as-is', academicConfig ?? undefined, layoutMode, pageSize);
        }
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
          // An ID card page keeps its scanned card images for swap/retake.
          if (page.idCard) {
            transientUris.add(page.idCard.front.uri);
            if (page.idCard.back) transientUris.add(page.idCard.back.uri);
          }
          if (page.splitFrom) {
            transientUris.add(page.splitFrom.uri);
            if (page.splitFrom.thumbUri) transientUris.add(page.splitFrom.thumbUri);
          }
        });
        // Images only Review's undo history still points at (pre-crop/sign versions, merged
        // halves) were kept alive for undo; the session ends here, so they go too.
        historyUris(state.review.history).forEach((uri) => transientUris.add(uri));
        cleanTemporaryCache(Array.from(transientUris));

        const libraryPages: LibraryPage[] = libraryInputPages.map((page, i) => ({
          id: page.id,
          ...savedImages.pages[i],
          width: page.width,
          height: page.height,
          ocr: page.ocr,
          ocrFailed: page.ocrFailed || undefined,
          layout: page.layout,
        }));

        // The suggestion from this render, not `name`: right after the profile sheet the name in
        // state may still be the one suggested before the profile was filled in.
        const finalName = (nameEdited ? name.trim() : suggestedName) || suggestedName;
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
          docType,
          // Only set when a cover page actually made it into libraryPages[0] - mirrors
          // coverPage's own condition, not just whether academicConfig exists.
          coverKind: coverPage ? academicConfig?.coverPage?.mode : undefined,
          // §5 T1: how document.pdf was laid out, for mapping library pages onto it.
          pdfLayout: layoutMode === '2_in_1' ? '2_in_1' : 'standard',
          pdfPageSize: pageSize,
        };

        dispatch({ type: 'library/ADD_FILE', file: doc });

        // §4 S6: the teacher's copy, built while this screen still shows progress. The library
        // document is already saved, so a failure here only loses the submission.
        let submission: SubmitResult | null = null;
        let record: Submission | null = null;
        let submitFailed = false;
        if (mode === 'submit') {
          try {
            const stored = state.deliver.academicConfig;
            const typeNumber = typeNumberOf(doc, [...state.library.files, doc]);
            submission = await submitDocument({
              doc,
              preset: currentPreset,
              profile,
              course,
              n: typeNumber,
              coverValues: stored?.coverPage?.mode === 'template' ? stored.coverPage.values : undefined,
              headerText: stored?.headerText,
              coverPhotoUri: stored?.coverPage?.mode === 'imported_image' ? stored.coverPage.importedUri : undefined,
              quality,
              fileName: doc.name,
              onProgress: setProgress,
            });
            record = submissionRecord(doc, submission, currentPreset, typeNumber);
            dispatch({ type: 'library/ADD_SUBMISSION', submission: record });
          } catch (error) {
            console.warn('DeliverScreen: submission build failed', error);
            submitFailed = true;
          }
        }
        dispatch({ type: 'capture/CLEAR_PAGES' });
        dispatch({ type: 'review/RESET' });
        dispatch({ type: 'deliver/RESET' });
        // Land where the new document is: its course page, or the Library for an unsorted one.
        if (doc.courseId) {
          dispatch({ type: 'library/SET_ACTIVE_COURSE', id: doc.courseId });
          go('course');
        } else {
          go('library');
        }

        // The device-folder copy runs after the in-app save has already succeeded and never
        // blocks or replaces it — a SAF failure here must not affect the primary save/undo flow.
        let snackMsg = shareAfter ? 'Saved · sharing…' : `Saved · ${courseName}`;
        // Saved all the same; the student decides whether to drop pages or pick a bigger limit.
        if (sizeWarning) snackMsg = sizeWarning;
        if (submission) {
          snackMsg = submission.fits
            ? `Submitting ${submission.fileName} · ${formatLimit(submission.sizeBytes)}`
            : tooLargeMessage(submission, currentPreset.sizeLimitBytes ?? 0);
        } else if (submitFailed) {
          snackMsg = `Saved · ${courseName} · couldn't build the submission`;
        }
        if (mode === 'save' && Platform.OS === 'android' && exportCopy && androidExportFolderUri) {
          const result = await exportCopyToDeviceFolder(androidExportFolderUri, doc);
          if (!sizeWarning) snackMsg =
            result.failed === 0
              ? `Saved · ${courseName} · copied to ${androidExportFolderLabel ?? 'device folder'}`
              : `Saved · ${courseName} · copy to device folder failed`;
        }

        // §4 S8: a submission that answers an open deadline offers to settle it, instead of Undo.
        const deadline = record ? matchDeadline(doc, state.library.deadlines) : undefined;
        if (deadline && record) {
          const submissionId = record.id;
          dispatch({
            type: 'ui/SHOW_SNACK',
            msg: `${snackMsg} · Mark '${deadline.title}' as done?`,
            action: 'Done',
            onAction: () => dispatch({ type: 'library/UPDATE_DEADLINE', id: deadline.id, patch: { doneSubmissionId: submissionId } }),
          });
        } else {
          dispatch({
            type: 'ui/SHOW_SNACK',
            msg: snackMsg,
            action: 'Undo',
            onAction: () => {
              dispatch({ type: 'library/REMOVE_FILES', ids: [documentId] });
              deleteDocumentFiles(documentId);
            },
          });
        }

        if (shareAfter) await shareDocument(doc);
        if (submission) await shareAs(submission.uri, submission.fileName, 'application/pdf');
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
      sizeLimit,
      format,
      name,
      nameEdited,
      suggestedName,
      currentPreset,
      profile,
      course,
      state.deliver.academicConfig,
      state.library.files,
      state.library.deadlines,
      state.review.history,
      courseId,
      courseName,
      docType,
      ocrScript,
      exportCopy,
      academicConfig,
      layoutMode,
      pageSize,
      androidExportFolderUri,
      androidExportFolderLabel,
      state.capture.mode,
      dispatch,
      go,
    ]
  );

  // The first Submit without a name and roll asks for them once (or Skip), then carries on.
  const handleSubmit = useCallback(() => {
    if (!isProfileComplete(profile) && !profilePrompted) {
      setProfilePromptOpen(true);
      return;
    }
    handleSaveInternal('submit');
  }, [profile, profilePrompted, handleSaveInternal]);

  // Runs after the render that has the new profile in it, so the name and cover use it.
  useEffect(() => {
    if (!pendingSubmit) return;
    setPendingSubmit(false);
    handleSaveInternal('submit');
  }, [pendingSubmit, handleSaveInternal]);

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
          helperText={nameEdited ? undefined : 'From your naming template in Settings.'}
        />

        <View>
          <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Format</Text>
          <FormatSegmented value={format} onChange={(value) => dispatch({ type: 'deliver/SET_FORMAT', format: value })} />
        </View>

        {sizeLimit === null ? (
          <View>
            <View style={styles.qualityHeader}>
              <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Quality</Text>
              <Text style={[styles.sizeEstimate, { color: tokens.accentInk }]}>≈ {formatBytes(sizeEstimate)}</Text>
            </View>
            <QualitySlider value={quality} onChange={(value) => dispatch({ type: 'deliver/SET_QUALITY', quality: value })} />
          </View>
        ) : null}

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

        <View style={styles.typeSection}>
          <View style={styles.qualityHeader}>
            <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Course</Text>
            <Text style={{ color: tokens.muted, fontSize: 13 }}>
              {courseId === null ? 'Unsorted' : automatic ? 'Suggested' : ''}
            </Text>
          </View>
          {suggestions.length > 0 ? (
            <CourseChips
              courses={courses}
              suggestions={suggestions}
              selectedId={courseId}
              onSelect={(id) => dispatch({ type: 'deliver/SET_COURSE', courseId: id })}
              onMore={() => setFolderPickerOpen(true)}
            />
          ) : (
            <Pressable
              style={[styles.saveToRow, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
              onPress={() => setFolderPickerOpen(true)}
            >
              <Text style={{ color: tokens.ink, fontSize: 15 }}>Save to</Text>
              <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>{courseName}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.typeSection}>
          <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Type</Text>
          <DocTypeSelector value={docType} onChange={(type) => dispatch({ type: 'deliver/SET_DOC_TYPE', docType: type })} />
        </View>

        <View style={[styles.optionsCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Pressable
            style={styles.optionsHeader}
            onPress={() => setOptionsOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: optionsOpen }}
          >
            <View style={styles.optionsHeaderText}>
              <Text style={[styles.sectionLabelInline, { color: tokens.ink }]}>Submission</Text>
              <Text style={{ color: tokens.muted, fontSize: 13 }} numberOfLines={2}>
                {summarizePreset(currentPreset)}
              </Text>
            </View>
            <Ionicons name={optionsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={tokens.muted} />
          </Pressable>

          {optionsOpen && (
            <View style={styles.optionsBody}>
              <View>
                <View style={styles.qualityHeader}>
                  <Text style={[styles.sectionLabel, { color: tokens.ink }]}>File size</Text>
                  {sizeLimitBytes !== null ? (
                    <Text style={[styles.sizeEstimate, { color: tokens.accentInk }]}>Will be ≤ {formatLimit(sizeLimitBytes)}</Text>
                  ) : null}
                </View>
                <SizeTargetRow value={sizeLimitBytes} onChange={(bytes) => dispatch({ type: 'deliver/SET_SIZE_LIMIT', bytes })} />
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
                <Text style={[styles.sectionLabel, { color: tokens.ink }]}>Page size</Text>
                <SegmentedControl
                  segments={PAGE_SIZE_SEGMENTS}
                  value={pageSize}
                  onChange={(value) => dispatch({ type: 'deliver/SET_PAGE_SIZE', pageSize: value })}
                />
              </View>

              <Pressable
                style={[styles.saveToRow, { backgroundColor: tokens.bg, borderColor: tokens.edge }]}
                onPress={() => go('academicOptions')}
              >
                <Text style={{ color: tokens.ink, fontSize: 15 }}>Cover, footer, border</Text>
                <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>
                  {summarizeAcademicConfig(academicConfig)}
                </Text>
              </Pressable>

              <View style={styles.rememberRow}>
                <View style={styles.optionsHeaderText}>
                  <Text style={{ color: tokens.ink, fontSize: 15 }}>Include my annotations</Text>
                  <Text style={{ color: tokens.muted, fontSize: 12.5 }}>
                    Highlights, pen and notes in the submitted file. Off gives the teacher a clean copy.
                  </Text>
                </View>
                <Switch
                  value={!!state.deliver.includeAnnotations}
                  onValueChange={(include) => dispatch({ type: 'deliver/SET_INCLUDE_ANNOTATIONS', include })}
                  trackColor={{ true: tokens.accent, false: tokens.surface2 }}
                />
              </View>

              {course ? (
                <>
                  <NameField
                    label={`File name template for ${course.code || course.name}`}
                    value={state.deliver.nameTemplate ?? ''}
                    onChange={(value) => dispatch({ type: 'deliver/SET_NAME_TEMPLATE', template: value })}
                    placeholder={state.settings.nameTemplate}
                    helperText="Empty: the template from Settings."
                  />
                  <View style={styles.rememberRow}>
                    <View style={styles.optionsHeaderText}>
                      <Text style={{ color: tokens.ink, fontSize: 15 }}>Remember for {course.code || course.name}</Text>
                      <Text style={{ color: tokens.muted, fontSize: 12.5 }}>
                        The next scan for this course starts with these options.
                      </Text>
                    </View>
                    <Switch
                      value={rememberPreset}
                      onValueChange={(remember) => dispatch({ type: 'deliver/SET_REMEMBER_PRESET', remember })}
                      trackColor={{ true: tokens.accent, false: tokens.surface2 }}
                    />
                  </View>
                </>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      <StickyActions
        saving={saving}
        progress={progress}
        onSubmit={handleSubmit}
        onSave={() => handleSaveInternal('save')}
        onSaveShare={() => handleSaveInternal('share')}
      />

      <ProfilePromptSheet
        visible={profilePromptOpen}
        initial={profile}
        onDone={(patch) => {
          if (patch) dispatch({ type: 'settings/SET_PROFILE', profile: patch });
          dispatch({ type: 'settings/SET_PROFILE_PROMPTED' });
          setProfilePromptOpen(false);
          setPendingSubmit(true);
        }}
        onCancel={() => setProfilePromptOpen(false)}
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
  typeSection: {
    gap: spacing.sm,
  },
  saveToRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionsCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  optionsHeaderText: {
    flex: 1,
    gap: 2,
  },
  sectionLabelInline: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionsBody: {
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
