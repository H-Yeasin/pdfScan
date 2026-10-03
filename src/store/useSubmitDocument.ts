import { useCallback } from 'react';
import { canSubmit, isPasswordProtected } from '../services/documents/formatCapabilities';
import { typeNumberOf } from '../services/courses/docTypes';
import { shareAs } from '../services/sharing/shareService';
import { defaultSubmitPreset } from '../services/submit/preset';
import { formatLimit, tooLargeMessage } from '../services/submit/sizeTarget';
import { submitDocument } from '../services/submit/submitDocument';
import { ensureSubmissionFile, submissionRecord } from '../services/submit/history';
import { matchDeadline } from '../services/submit/deadlines';
import type { LibraryDocument, Submission } from '../types/models';
import { useAppDispatch, useAppSlices } from './AppStateContext';
import { t } from '../i18n';
import { hapticSuccess, hapticWarning } from '../services/feedback/haptics';
import { useIsPro } from '../services/pro/entitlement';
import { logUsage } from '../services/telemetry/usage';
import { institutionLogoUri } from '../services/submit/institutionLogo';

// "Submit" for a document saved earlier (Library selection, Reader): rebuilds the teacher's copy
// with its course's preset as it is now, then opens the share sheet. Returns false when the
// document can't be submitted (a DOCX, a sheet, a password-protected PDF).
export function useSubmitDocument() {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  const { files, courses, deadlines, annotations } = state.library;
  const { profile, institutionLogo } = state.settings;
  const isPro = useIsPro();

  return useCallback(
    async (doc: LibraryDocument): Promise<boolean> => {
      if (!canSubmit(doc)) {
        dispatch({ type: 'ui/SHOW_SNACK', msg: isPasswordProtected(doc) ? t('library.passwordProtected') : t('submit.onlyScanned') });
        return false;
      }
      const course = courses.find((c) => c.id === doc.courseId);
      const preset = course?.submitPreset ?? defaultSubmitPreset(doc.courseId ?? null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: preset.sizeLimitBytes ? t('deliver.progress.fitting', { size: formatLimit(preset.sizeLimitBytes) }) : t('deliver.progress.building') });
      try {
        const n = typeNumberOf(doc, files);
        const result = await submitDocument({
          doc,
          preset,
          profile,
          course,
          n,
          annotations: annotations.filter((a) => a.documentId === doc.id),
          proCovers: isPro,
          logoUri: institutionLogoUri(institutionLogo),
        });
        const record = submissionRecord(doc, result, preset, n);
        dispatch({ type: 'library/ADD_SUBMISSION', submission: record });
        logUsage('document_submitted');
        const msg = !result.fits
          ? tooLargeMessage(result, preset.sizeLimitBytes ?? 0)
          : result.rasterized
            ? t('submit.rasterized', { limit: formatLimit(preset.sizeLimitBytes ?? result.sizeBytes) })
            : t('deliver.snack.submitting', { file: result.fileName, size: formatLimit(result.sizeBytes) });
        const deadline = matchDeadline(doc, deadlines);
        dispatch(
          deadline
            ? {
                type: 'ui/SHOW_SNACK',
                msg: t('deliver.snack.markDone', { message: msg, title: deadline.title }),
                action: t('deliver.snack.done'),
                onAction: () => dispatch({ type: 'library/UPDATE_DEADLINE', id: deadline.id, patch: { doneSubmissionId: record.id } }),
              }
            : { type: 'ui/SHOW_SNACK', msg }
        );
        hapticSuccess();
        await shareAs(result.uri, result.fileName, 'application/pdf');
        return true;
      } catch (error) {
        console.warn('useSubmitDocument: submit failed', error);
        hapticWarning();
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('submit.buildFailed') });
        return false;
      }
    },
    [files, courses, deadlines, annotations, profile, isPro, institutionLogo, dispatch]
  );
}

// "Share again" for a recorded submission: shares the stored file, rebuilding it first if it's
// gone (history.ensureSubmissionFile).
export function useShareSubmission() {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  const { files, courses, annotations } = state.library;
  const { profile, institutionLogo } = state.settings;

  return useCallback(
    async (submission: Submission): Promise<void> => {
      const doc = files.find((f) => f.id === submission.documentId);
      if (!doc) return;
      try {
        const course = courses.find((c) => c.id === doc.courseId);
        const { uri, rebuilt } = await ensureSubmissionFile(submission, doc, { profile, course, docs: files, annotations, logoUri: institutionLogoUri(institutionLogo) });
        if (rebuilt) dispatch({ type: 'ui/SHOW_SNACK', msg: t('submit.rebuilt', { file: submission.fileName }) });
        await shareAs(uri, submission.fileName, 'application/pdf');
      } catch (error) {
        console.warn('useShareSubmission: failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('submit.shareFailed') });
      }
    },
    [files, courses, annotations, profile, institutionLogo, dispatch]
  );
}
