import type { Dispatch } from 'react';
import { t } from '../../i18n';
import type { AppAction } from '../../store/appReducer';
import type { EnhanceMode, OcrScript, SessionPage } from '../../types/models';
import { hapticSuccess, hapticWarning } from '../feedback/haptics';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import type { CaptureModeSpec } from './captureModes';
import { warpPerspectiveCrop } from '../enhance/perspectiveCrop';
import { splitSpread } from '../enhance/splitSpread';
import { createId } from '../../utils/id';
import { composeIdCardPages } from './idCardPages';
import { detectDocumentQuad } from './quadDetector';
import { ingestPage, pageFromMaster, readPage } from './ingest';
import { beginProcessing, endProcessing } from './processingSession';
import { processSequentially } from './processSequentially';
import { logUsage } from '../telemetry/usage';

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
// needsCropReview for Review's "Check crops".
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
// landscape spread into left + right pages; a portrait capture in Book mode stays one page. If
// splitting itself fails, the whole spread is kept as one page rather than losing the capture.
// §16 G7: the pages come back with a master and a thumbnail and nothing else - no stats, no text.
// A batch shows them at once and reads them afterwards (readTexts); ID card pages are composed in
// pairs after the batch (composeIdCardPages) and only the composed page is read.
export async function ingestOne(
  uri: string,
  options: Pick<IngestBatchOptions, 'script' | 'spec' | 'ownsInputs'> & { autoCrop?: boolean }
): Promise<SessionPage[]> {
  const { script, spec, ownsInputs, autoCrop } = options;
  const enhance = spec.defaultEnhance;

  let page = await ingestPage(uri, script, { deleteSource: ownsInputs, enhance, ocr: false });
  if (autoCrop) page = await autoCropPage(page, script, enhance);

  // An uncropped photo still shows the desk around the book; splitting that would put the gutter
  // in the wrong place, so it waits for a manual crop as one page.
  if (spec.postProcess !== 'splitSpread' || page.needsCropReview) return [page];

  const spread = page;
  let halves: Awaited<ReturnType<typeof splitSpread>> = null;
  try {
    halves = await splitSpread(spread.uri);
  } catch (error) {
    console.warn('ingestOne: spread split failed, keeping the whole page', error);
  }
  if (!halves) return [spread];

  const splitFrom = {
    groupId: createId('spread'),
    uri: spread.uri,
    thumbUri: spread.thumbUri,
    width: spread.width,
    height: spread.height,
  };
  const pages: SessionPage[] = [];
  for (const half of halves) {
    pages.push({ ...(await pageFromMaster(half, script, { enhance, ocr: false })), splitFrom });
  }
  return pages;
}

// §16 G7: the reading that follows a batch. One run at a time: a new batch, a save (Deliver) or a
// cancel stops it after the page it is on.
let reading: AbortController | null = null;
let readingDone: Promise<void> = Promise.resolve();

export function stopReadingText(): void {
  reading?.abort();
}

// Settles when the reading that is running (if any) has finished or stopped. Never rejects.
export function textReadingDone(): Promise<void> {
  return readingDone;
}

// Gives each page its filter stats and its text, one page at a time, in the order they were
// added. Every page is told that the wait is over, read or not: a page that was skipped (stopped,
// or the session moved on) is read when the document is saved, as any page without text is.
// The stats go through SET_PAGE_STATS, which drops them if the page's image changed meanwhile
// (a crop); stale text is harmless, because its ocrGeometry no longer matches the page.
async function readTexts(
  dispatch: Dispatch<AppAction>,
  pages: readonly SessionPage[],
  script: OcrScript,
  signal: AbortSignal
): Promise<void> {
  // After the batch's own messages (the "added" snack, the status) have had their render.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (const page of pages) {
    if (signal.aborted) {
      dispatch({ type: 'capture/UPDATE_PAGE', id: page.id, patch: { ocrPending: undefined } });
      continue;
    }
    const { stats, ocr, ocrGeometry } = await readPage(page, script);
    if (stats) dispatch({ type: 'capture/SET_PAGE_STATS', id: page.id, uri: page.uri, stats });
    dispatch({ type: 'capture/UPDATE_PAGE', id: page.id, patch: { ocr, ocrGeometry, ocrPending: undefined } });
  }
}

function startReadingTexts(dispatch: Dispatch<AppAction>, pages: readonly SessionPage[], script: OcrScript, stopped: boolean): void {
  const controller = new AbortController();
  if (stopped) controller.abort();
  reading = controller;
  readingDone = readTexts(dispatch, pages, script, controller.signal)
    .catch((error) => console.warn('ingestBatch: reading the pages failed', error))
    .finally(() => {
      if (reading === controller) reading = null;
    });
}

function pagesLabel(n: number): string {
  return t('capture.pages', { count: n });
}

// Ingests a batch of raw images into the capture session, one page at a time, reporting
// "page N of M" progress through capture/SET_PROGRESS (one dispatch per page), cancellable from
// Review (see processingSession.ts). Whatever finished is always kept - after a cancel or a
// failure too.
// §16 G7: each page goes into the session as soon as it has a master and a thumbnail
// (capture/ADD_PAGE: the first takes a pending retake's place, the rest follow it), so Review
// shows page 1 while page 2 is still being made. Their stats and text are read once the batch is
// in (readTexts), without holding up the "added" message; this resolves before that reading ends.
// ID card pages can't be shown one by one - a page is two scans - so that mode still commits once,
// after composing, in one BULK_ADD_PAGES.
// The caller has already set processingStatus to 'processing'.
export async function ingestBatch(
  dispatch: Dispatch<AppAction>,
  rawUris: readonly string[],
  options: IngestBatchOptions
): Promise<void> {
  const { script, spec, ownsInputs, onScanMore, autoCrop } = options;
  // The pages of the batch before this one that weren't read yet are read when they're saved.
  stopReadingText();
  const signal = beginProcessing();
  const progressive = spec.postProcess !== 'idCard';
  const waiting: SessionPage[] = [];

  const result = await processSequentially(
    rawUris,
    async (uri) => {
      const made = await ingestOne(uri, { script, spec, ownsInputs, autoCrop });
      if (!progressive) return made;
      for (const page of made) {
        const pending: SessionPage = { ...page, ocrPending: true };
        dispatch({ type: 'capture/ADD_PAGE', page: pending, afterId: waiting[waiting.length - 1]?.id });
        waiting.push(pending);
      }
      return made;
    },
    {
      signal,
      onProgress: (progress) => dispatch({ type: 'capture/SET_PROGRESS', progress }),
      discardInput: ownsInputs ? (uri) => cleanTemporaryCache([uri]) : undefined,
    }
  );
  endProcessing(signal);

  dispatch({ type: 'capture/SET_PROGRESS', progress: null });
  let pages: SessionPage[] = result.items.flat();
  if (!progressive && pages.length > 0) {
    pages = await composeIdCardPages(pages, script);
    dispatch({ type: 'capture/BULK_ADD_PAGES', pages });
  }
  // After a cancel nothing more is read ("stop" means stop): the run only clears the pages' flags.
  if (waiting.length > 0) startReadingTexts(dispatch, waiting, script, result.cancelled);

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
  // §10 M8: the page count only.
  logUsage('scan_completed', { pages: pages.length });
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
