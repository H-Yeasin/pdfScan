import type { Dispatch } from 'react';
import { t } from '../../i18n';
import type { AppAction } from '../../store/appReducer';
import type { EnhanceMode, OcrScript, SessionPage } from '../../types/models';
import { hapticSuccess, hapticWarning } from '../feedback/haptics';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import type { CaptureModeSpec } from './captureModes';
import { warpPerspectiveCrop } from '../enhance/perspectiveCrop';
import { splitSpread } from '../enhance/splitSpread';
import { runOcr } from '../ocr/ocrService';
import { createId } from '../../utils/id';
import { composeIdCardPages } from './idCardPages';
import { detectDocumentQuad } from './quadDetector';
import { ingestPage, pageFromMaster } from './ingest';
import { beginProcessing, endProcessing } from './processingSession';
import { processSequentially } from './processSequentially';

export type IngestBatchOptions = {
  script: OcrScript;
  spec: CaptureModeSpec;
  // Scanner output lives in our cache and is deleted once ingested (or discarded); gallery
  // photos are the user's and are never deleted.
  ownsInputs: boolean;
  // Offered as the snack's "Scan more" action after a successful batch.
  onScanMore?: () => void;
  // Find and straighten the page in each image (gallery photos; scanner output is pre-cropped).
  autoCrop?: boolean;
};

// Gallery photos (unlike scanner output, which Google's scanner has already cropped) get their
// page found and straightened: a confident detection is warped into a new master (one encode);
// a doubtful one is only suggested, and no detection keeps the full photo - both flagged
// needsCropReview for Review's "Check crops". Returns the page without OCR.
async function autoCropPage(page: SessionPage, script: OcrScript, enhance: EnhanceMode): Promise<SessionPage> {
  const detection = await detectDocumentQuad(page.uri);
  if (detection?.confidence === 'high') {
    try {
      const cropped = await warpPerspectiveCrop(page.uri, detection.quad);
      cleanTemporaryCache(page.thumbUri ? [page.uri, page.thumbUri] : [page.uri]);
      return pageFromMaster(cropped, script, { enhance, ocr: false });
    } catch (error) {
      console.warn('autoCropPage: warp failed, leaving the photo for manual cropping', error);
    }
  }
  return {
    ...page,
    needsCropReview: true,
    cropSuggestion: detection?.confidence === 'low' ? detection.quad : undefined,
  };
}

// One raw capture -> its session page(s), applying the mode's post-processing. Book mode splits a
// landscape spread into left + right pages (OCR'd per half, not on the whole spread); a portrait
// capture in Book mode stays one page. If splitting itself fails, the whole spread is kept as one
// page rather than losing the capture. ID card pages are left un-OCR'd: they're composed in pairs
// after the batch (composeIdCardPages) and only the composed page is OCR'd.
export async function ingestOne(
  uri: string,
  options: Pick<IngestBatchOptions, 'script' | 'spec' | 'ownsInputs'> & { autoCrop?: boolean }
): Promise<SessionPage[]> {
  const { script, spec, ownsInputs, autoCrop } = options;
  const enhance = spec.defaultEnhance;
  const base = { deleteSource: ownsInputs, enhance };
  if (!autoCrop && spec.postProcess === 'none') return [await ingestPage(uri, script, base)];

  let page = await ingestPage(uri, script, { ...base, ocr: false });
  if (autoCrop) page = await autoCropPage(page, script, enhance);

  if (spec.postProcess === 'idCard') return [page];
  const ocrPage = async (p: SessionPage) => ({ ...p, ocr: await runOcr(p.uri, script) });
  // An uncropped photo still shows the desk around the book; splitting that would put the gutter
  // in the wrong place, so it waits for a manual crop as one page.
  if (spec.postProcess !== 'splitSpread' || page.needsCropReview) return [await ocrPage(page)];

  const spread = page;
  let halves: Awaited<ReturnType<typeof splitSpread>> = null;
  try {
    halves = await splitSpread(spread.uri);
  } catch (error) {
    console.warn('ingestOne: spread split failed, keeping the whole page', error);
  }
  if (!halves) return [await ocrPage(spread)];

  const splitFrom = {
    groupId: createId('spread'),
    uri: spread.uri,
    thumbUri: spread.thumbUri,
    width: spread.width,
    height: spread.height,
  };
  const pages: SessionPage[] = [];
  for (const half of halves) {
    pages.push({ ...(await pageFromMaster(half, script, { enhance })), splitFrom });
  }
  return pages;
}

function pagesLabel(n: number): string {
  return t('capture.pages', { count: n });
}

// Ingests a batch of raw images into the capture session, one page at a time, reporting
// "page N of M" progress through capture/SET_PROGRESS, cancellable from Review (see
// processingSession.ts). Whatever finished is always kept - after a cancel or a failure too -
// and committed in one BULK_ADD_PAGES so a pending retake splices in at the right position.
// The caller has already set processingStatus to 'processing'.
export async function ingestBatch(
  dispatch: Dispatch<AppAction>,
  rawUris: readonly string[],
  options: IngestBatchOptions
): Promise<void> {
  const { script, spec, ownsInputs, onScanMore, autoCrop } = options;
  const signal = beginProcessing();

  const result = await processSequentially(
    rawUris,
    (uri) => ingestOne(uri, { script, spec, ownsInputs, autoCrop }),
    {
      signal,
      onProgress: (progress) => dispatch({ type: 'capture/SET_PROGRESS', progress }),
      discardInput: ownsInputs ? (uri) => cleanTemporaryCache([uri]) : undefined,
    }
  );
  endProcessing(signal);

  dispatch({ type: 'capture/SET_PROGRESS', progress: null });
  let pages: SessionPage[] = result.items.flat();
  if (spec.postProcess === 'idCard' && pages.length > 0) pages = await composeIdCardPages(pages, script);
  if (pages.length > 0) dispatch({ type: 'capture/BULK_ADD_PAGES', pages });

  if (result.error !== undefined) {
    hapticWarning();
    const failedPage = (result.failedIndex ?? 0) + 1;
    dispatch({
      type: 'capture/SET_PROCESSING_STATUS',
      status: 'error',
      errorMessage:
        pages.length > 0
          ? t('capture.pageFailedKept', { page: failedPage, pages: pagesLabel(pages.length) })
          : t('capture.pageFailed', { page: failedPage }),
    });
    return;
  }

  if (result.cancelled) {
    dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('capture.stopped', { pages: pagesLabel(pages.length) }) });
    return;
  }

  hapticSuccess();
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'success' });
  dispatch({
    type: 'ui/SHOW_SNACK',
    msg: t('capture.added', { pages: pagesLabel(pages.length) }),
    ...(onScanMore ? { action: t('capture.scanMore'), onAction: onScanMore } : null),
  });
}

// Our Gallery button: every photo is auto-cropped (see autoCropPage), one at a time.
export async function ingestGalleryBatch(
  dispatch: Dispatch<AppAction>,
  uris: readonly string[],
  script: OcrScript,
  spec: CaptureModeSpec
): Promise<void> {
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });
  await ingestBatch(dispatch, uris, { script, spec, ownsInputs: false, autoCrop: true });
}
