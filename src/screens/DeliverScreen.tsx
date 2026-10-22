import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { FolderPickerModal } from '../components/deliver/FolderPickerModal';
import { FormatSegmented } from '../components/deliver/FormatSegmented';
import { NameField } from '../components/deliver/NameField';
import { PagePreviewStrip } from '../components/deliver/PagePreviewStrip';
import { StickyActions } from '../components/deliver/StickyActions';
import { SubmitSheet } from '../components/deliver/SubmitSheet';
import { ProfilePromptSheet } from '../components/deliver/ProfilePromptSheet';
import { SegmentedControl } from '../components/shared/SegmentedControl';
import { Chip, Menu, ScreenHeader, Text, type MenuSection } from '../components/ui';
import { formatBytes, tDoc } from '../i18n';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { summarizeAcademicConfig } from './AcademicOptionsScreen';
import { exportCopyToDeviceFolder } from '../services/export/deviceExportService';
import { stopReadingText } from '../services/capture/ingestBatch';
import { estimateSizeBytes } from '../services/pdf/pdfService';
import { deleteDocumentFiles } from '../services/persistence/libraryFiles';
import { appendDocuments } from '../services/persistence/libraryOperations';
import { shareAs } from '../services/sharing/shareService';
import { historyUris } from '../store/pageHistory';
import { getCaptureModeSpec } from '../services/capture/captureModes';
import { DOC_TYPES, defaultDocTypeFor, getDocType, typeNumberOf } from '../services/courses/docTypes';
import { loadSaveScanDeps, saveScan } from '../services/deliver/saveScan';
import { SIZE_CHOICES, SIZE_QUALITY, sizeChoiceOf, type SizeChoice } from '../services/deliver/sizeChoice';
import { suggestName } from '../services/submit/naming';
import { defaultSubmitPreset, presetFromDeliver, presetsEqual, summarizePreset } from '../services/submit/preset';
import { isProfileComplete } from '../services/submit/profile';
import { submitDocument, type SubmitResult } from '../services/submit/submitDocument';
import { submissionRecord } from '../services/submit/history';
import { institutionLogoUri } from '../services/submit/institutionLogo';
import { useIsPro } from '../services/pro/entitlement';
import { logUsage } from '../services/telemetry/usage';
import { matchDeadline } from '../services/submit/deadlines';
import type { DocType, Submission } from '../types/models';
import { formatLimit, tooLargeMessage } from '../services/submit/sizeTarget';
import { useAppDispatch, useAppSlices } from '../store/AppStateContext';
import { useNamingContext, useResolvedAcademicConfig } from '../store/useDeliverContext';
import { useFilingCourse } from '../store/useFilingCourse';
import { useSpaceGuard } from '../store/useSpaceGuard';
import { BYTES_PER_SAVED_PAGE } from '../services/storage/usage';
import { resolveOcrScript } from '../services/scripts/registry';
import { ICONS, radii, spacing, useTheme } from '../theme';
import { createId } from '../utils/id';
import { hapticSuccess, hapticWarning } from '../services/feedback/haptics';

type SaveMode = 'save' | 'submit';

function defaultName(): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  return tDoc('document.scanName', { date: iso });
}

// §17 U9: the "Save" step of Scan → Save → Done (its screen id stays `deliver`). What is saved
// (the pages, a tap away from Review), its name, course and type, format and size; Save, or
// Submit… for the teacher's copy (SubmitSheet). The work is services/deliver/saveScan.ts; this
// collects the options, shows the progress and goes to Done.
export function DeliverScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('capture', 'deliver', 'library', 'review', 'settings');
  const { pages } = state.capture;
  const { name, nameEdited, format, quality, sizeLimitBytes, layoutMode, pageSize } = state.deliver;
  // The academic options as they will be drawn: cover defaults and header/footer tokens filled in.
  const academicConfig = useResolvedAcademicConfig();
  const namingContext = useNamingContext();
  // The picked course, or the top suggestion (timetable, last used, ...) until the student picks.
  const { courseId, automatic } = useFilingCourse();
  const { beforeSave } = useSpaceGuard();
  // Every saved document gets a type: the student's pick, or the capture mode's default.
  const docType = state.deliver.docType ?? defaultDocTypeFor(getCaptureModeSpec(state.capture.mode));
  const { courses } = state.library;
  const { androidExportFolderUri, androidExportFolderLabel, copyScansToFolder, profile, profilePrompted, institutionLogo } = state.settings;
  const isPro = useIsPro();
  const { presetCourseId, rememberPreset } = state.deliver;
  // §7 R3: the saved document these pages are being added to, if any.
  const appendTarget = useMemo(
    () => (state.deliver.appendTo ? state.library.files.find((f) => f.id === state.deliver.appendTo) : undefined),
    [state.deliver.appendTo, state.library.files]
  );
  // The course's own file-name template, if its preset has one, else the Settings one.
  const nameTemplate = state.deliver.nameTemplate ?? state.settings.nameTemplate;
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [profilePromptOpen, setProfilePromptOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // §4 S6: the filing course's submit preset becomes the options whenever the course changes
  // (Unsorted and courses without one get the default), and while "Remember" is on every change
  // to them is saved back to the course, so the next scan for it is already set up.
  const course = useMemo(() => courses.find((c) => c.id === courseId), [courses, courseId]);
  // §6 L1: the final OCR uses the filing course's script, else the app setting.
  const ocrScript = resolveOcrScript({ course, settings: state.settings });
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
    () => courses.find((c) => c.id === courseId)?.name ?? t('common.unsorted'),
    [courses, courseId, t]
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
  const sizeChoice = sizeChoiceOf(quality);

  const handleSaveInternal = useCallback(
    async (requestedMode: SaveMode) => {
      if (pages.length === 0 || saving) return;
      // §8 B1: stop before writing anything when the phone is too full; the session is untouched.
      if (!beforeSave(pages.length * BYTES_PER_SAVED_PAGE)) return;
      // §7 R3: pages going to the end of a saved document are plain pages - no cover, stamps,
      // 2-in-1 layout or size target (the document is rebuilt with its own pages) - and aren't
      // submitted on their own.
      const mode: SaveMode = appendTarget ? 'save' : requestedMode;
      const academic = appendTarget ? null : academicConfig;
      setSaving(true);
      // §16 G7: pages a scan is still reading are read here instead, one job at a time.
      stopReadingText();
      try {
        // The suggestion from this render, not `name`: right after the profile sheet the name in
        // state may still be the one suggested before the profile was filled in.
        const finalName = (nameEdited ? name.trim() : suggestedName) || suggestedName;
        const { doc, oversize } = await saveScan(
          {
            documentId: createId('doc'),
            pages,
            name: finalName,
            format,
            mode: state.capture.mode,
            courseId,
            docType,
            quality,
            // §17 U9: the size target is the teacher's copy's (Submit fits that file to it); a saved
            // scan is built at the size picked here.
            sizeLimit: null,
            academic,
            layout: appendTarget ? 'standard' : layoutMode,
            pageSize,
            ocrScript,
            historyUris: historyUris(state.review.history),
          },
          loadSaveScanDeps(),
          setProgress
        );

        // §7 R3: the scanned pages join the end of the saved document; this new one was only the
        // way to build them, and goes again.
        if (appendTarget) {
          const appended = await appendDocuments(appendTarget, [doc]);
          deleteDocumentFiles(doc.id);
          dispatch({ type: 'library/UPDATE_FILE', id: appendTarget.id, patch: appended });
          dispatch({ type: 'capture/CLEAR_PAGES' });
          dispatch({ type: 'review/RESET' });
          dispatch({ type: 'deliver/RESET' });
          dispatch({ type: 'reader/SET_READER_ID', id: appendTarget.id });
          go('reader');
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.edit.added', { count: doc.pages.length }) });
          return;
        }

        dispatch({ type: 'library/ADD_FILE', file: doc });
        logUsage('document_saved');

        // §4 S6: the teacher's copy, built while this screen still shows progress. The library
        // document is already saved, so a failure here only loses the submission.
        let submission: SubmitResult | null = null;
        let record: Submission | null = null;
        let notice: string | undefined = oversize ? tooLargeMessage(oversize, sizeLimitBytes ?? 0) : undefined;
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
              proCovers: isPro,
              logoUri: institutionLogoUri(institutionLogo),
            });
            record = submissionRecord(doc, submission, currentPreset, typeNumber);
            dispatch({ type: 'library/ADD_SUBMISSION', submission: record });
            logUsage('document_submitted');
            notice = submission.fits
              ? t('deliver.snack.submitting', { file: submission.fileName, size: formatLimit(submission.sizeBytes) })
              : tooLargeMessage(submission, currentPreset.sizeLimitBytes ?? 0);
          } catch (error) {
            console.warn('DeliverScreen: submission build failed', error);
            notice = t('deliver.snack.submitFailed', { course: courseName });
          }
        }

        // The device-folder copy (Me → Export, §17 U9) runs after the in-app save has succeeded and
        // never blocks or replaces it: a SAF failure here only says so.
        if (Platform.OS === 'android' && copyScansToFolder && androidExportFolderUri) {
          const result = await exportCopyToDeviceFolder(androidExportFolderUri, doc);
          if (!notice) {
            notice =
              result.failed === 0
                ? t('deliver.snack.copied', { course: courseName, folder: androidExportFolderLabel ?? t('deliver.snack.deviceFolder') })
                : t('deliver.snack.copyFailed', { course: courseName });
          }
        }

        dispatch({ type: 'capture/CLEAR_PAGES' });
        dispatch({ type: 'review/RESET' });
        dispatch({ type: 'deliver/RESET' });
        dispatch({ type: 'deliver/SET_DONE', done: { docId: doc.id, submitted: !!submission, notice } });
        go('done');

        // §4 S8: a submission that answers an open deadline offers to settle it, instead of Undo.
        const deadline = record ? matchDeadline(doc, state.library.deadlines) : undefined;
        if (deadline && record) {
          const submissionId = record.id;
          dispatch({
            type: 'ui/SHOW_SNACK',
            msg: t('deliver.snack.markDone', { message: t('deliver.done.title'), title: deadline.title }),
            action: t('deliver.snack.done'),
            onAction: () => dispatch({ type: 'library/UPDATE_DEADLINE', id: deadline.id, patch: { doneSubmissionId: submissionId } }),
          });
        } else {
          dispatch({
            type: 'ui/SHOW_SNACK',
            msg: t('deliver.snack.saved', { course: courseName }),
            action: t('deliver.snack.undo'),
            onAction: () => {
              dispatch({ type: 'library/REMOVE_FILES', ids: [doc.id] });
              deleteDocumentFiles(doc.id);
            },
          });
        }

        hapticSuccess();
        if (submission) await shareAs(submission.uri, submission.fileName, 'application/pdf');
      } catch (error) {
        console.warn('DeliverScreen: save failed', error);
        hapticWarning();
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('deliver.snack.saveFailed') });
      } finally {
        setSaving(false);
        setProgress(null);
      }
    },
    [
      appendTarget,
      pages,
      saving,
      quality,
      sizeLimitBytes,
      format,
      name,
      nameEdited,
      suggestedName,
      currentPreset,
      profile,
      isPro,
      institutionLogo,
      course,
      state.deliver.academicConfig,
      state.library.files,
      state.library.deadlines,
      state.review.history,
      courseId,
      courseName,
      docType,
      ocrScript,
      copyScansToFolder,
      academicConfig,
      layoutMode,
      pageSize,
      androidExportFolderUri,
      androidExportFolderLabel,
      state.capture.mode,
      beforeSave,
      dispatch,
      go,
      t,
    ]
  );

  // The first Submit without a name and roll asks for them once (or Skip), then carries on.
  const handleSubmit = useCallback(() => {
    setSubmitOpen(false);
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

  const typeSections = useMemo(
    (): MenuSection<DocType>[] => [
      {
        items: DOC_TYPES.map((spec) => ({
          id: spec.id,
          label: t(spec.labelKey),
          icon: spec.icon,
          badge: spec.id === docType ? { label: t('review.modeSheet.current'), tone: 'accent' as const } : undefined,
        })),
      },
    ],
    [t, docType]
  );

  const sizeSegments = useMemo(() => SIZE_CHOICES.map((id) => ({ id, label: t(`deliver.sizeChoice.${id}`) })), [t]);
  const typeLabel = t(getDocType(docType).labelKey);

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <ScreenHeader
        title={t('deliver.title')}
        subtitle={t('library.pages', { count: pages.length })}
        back={() => go('review', 'back')}
      />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {appendTarget ? (
          <View style={[styles.appendBanner, { backgroundColor: tokens.surface2 }]}>
            <Text>{t('reader.edit.appendingTo', { name: appendTarget.name })}</Text>
          </View>
        ) : null}

        <PagePreviewStrip
          pages={pages}
          onPressPage={(index) => {
            dispatch({ type: 'review/SELECT_PAGE', index });
            go('review', 'back');
          }}
        />

        <NameField
          value={name}
          onChange={(value) => dispatch({ type: 'deliver/SET_NAME', name: value })}
          helperText={nameEdited ? undefined : t('deliver.nameFromTemplate')}
        />

        {appendTarget ? null : (
          <View style={styles.group}>
            <View style={styles.chips}>
              <Chip
                label={courseName}
                icon={ICONS.course}
                onPress={() => setFolderPickerOpen(true)}
                accessibilityLabel={t('deliver.courseChip', { course: courseName })}
                testID="save-course"
              />
              <Chip
                label={typeLabel}
                icon={getDocType(docType).icon}
                onPress={() => setTypeMenuOpen(true)}
                accessibilityLabel={t('deliver.typeChip', { type: typeLabel })}
                testID="save-type"
              />
            </View>
            {courseId !== null && automatic ? (
              <Text variant="caption" color="muted">
                {t('deliver.suggested')}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.group}>
          <Text variant="label">{t('deliver.format')}</Text>
          <FormatSegmented value={format} onChange={(value) => dispatch({ type: 'deliver/SET_FORMAT', format: value })} />
        </View>

        <View style={styles.group}>
          <View style={styles.labelRow}>
            <Text variant="label">{t('deliver.sizeLabel')}</Text>
            <Text variant="caption" color="accentInk">
              {t('deliver.sizeAbout', { size: formatBytes(sizeEstimate) })}
            </Text>
          </View>
          <SegmentedControl<SizeChoice>
            segments={sizeSegments}
            value={sizeChoice}
            onChange={(choice) => dispatch({ type: 'deliver/SET_QUALITY', quality: SIZE_QUALITY[choice] })}
          />
          {sizeLimitBytes !== null && !appendTarget ? (
            <Text variant="caption" color="muted">
              {t('deliver.sizeLimited', { size: formatLimit(sizeLimitBytes) })}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <StickyActions
        saving={saving}
        progress={progress}
        onSave={() => handleSaveInternal('save')}
        onSubmit={appendTarget ? undefined : () => setSubmitOpen(true)}
        submitSummary={summarizePreset(currentPreset)}
      />

      <SubmitSheet
        visible={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSubmit={handleSubmit}
        course={course}
        academicSummary={summarizeAcademicConfig(academicConfig)}
        onAcademic={() => {
          setSubmitOpen(false);
          go('academicOptions');
        }}
        sizeLimitBytes={sizeLimitBytes}
        onSizeLimit={(bytes) => dispatch({ type: 'deliver/SET_SIZE_LIMIT', bytes })}
        nameTemplate={state.deliver.nameTemplate ?? ''}
        defaultTemplate={state.settings.nameTemplate}
        onNameTemplate={(value) => dispatch({ type: 'deliver/SET_NAME_TEMPLATE', template: value })}
        layoutMode={layoutMode}
        onLayoutMode={(value) => dispatch({ type: 'deliver/SET_LAYOUT_MODE', layoutMode: value })}
        pageSize={pageSize}
        onPageSize={(value) => dispatch({ type: 'deliver/SET_PAGE_SIZE', pageSize: value })}
        includeAnnotations={!!state.deliver.includeAnnotations}
        onIncludeAnnotations={(include) => dispatch({ type: 'deliver/SET_INCLUDE_ANNOTATIONS', include })}
        rememberPreset={rememberPreset}
        onRememberPreset={(remember) => dispatch({ type: 'deliver/SET_REMEMBER_PRESET', remember })}
      />

      <Menu
        visible={typeMenuOpen}
        onClose={() => setTypeMenuOpen(false)}
        onSelect={(type) => dispatch({ type: 'deliver/SET_DOC_TYPE', docType: type })}
        sections={typeSections}
        title={t('deliver.type')}
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
    </View>
  );
}

const styles = StyleSheet.create({
  appendBanner: { padding: spacing.md, borderRadius: radii.card },
  container: {
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },
  group: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
});
