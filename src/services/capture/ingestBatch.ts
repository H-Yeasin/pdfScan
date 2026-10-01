import type { Dispatch } from 'react';
import type { AppAction } from '../../store/appReducer';
import type { OcrScript, SessionPage } from '../../types/models';
import { hapticSuccess, hapticWarning } from '../feedback/haptics';
import { cleanTemporaryCache } from '../persistence/libraryFiles';
import type { CaptureModeSpec } from './captureModes';
import { splitSpread } from '../enhance/splitSpread';
import { runOcr } from '../ocr/ocrService';
import { createId } from '../../utils/id';
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
};

// One raw capture -> its session page(s), applying the mode's post-processing. Book mode splits a
// landscape spread into left + right pages (OCR'd per half, not on the whole spread); a portrait
// capture in Book mode stays one page. If splitting itself fails, the whole spread is kept as one
// page rather than losing the capture.
export async function ingestOne(
  uri: string,
  options: Pick<IngestBatchOptions, 'script' | 'spec' | 'ownsInputs'>
): Promise<SessionPage[]> {
  const { script, spec, ownsInputs } = options;
  const base = { deleteSource: ownsInputs, enhance: spec.defaultEnhance };
  if (spec.postProcess !== 'splitSpread') return [await ingestPage(uri, script, base)];

  const spread = await ingestPage(uri, script, { ...base, ocr: false });
  let halves: Awaited<ReturnType<typeof splitSpread>> = null;
  try {
    halves = await splitSpread(spread.uri);
  } catch (error) {
    console.warn('ingestOne: spread split failed, keeping the whole page', error);
  }
  if (!halves) return [{ ...spread, ocr: await runOcr(spread.uri, script) }];

  const splitFrom = {
    groupId: createId('spread'),
    uri: spread.uri,
    thumbUri: spread.thumbUri,
    width: spread.width,
    height: spread.height,
  };
  const pages: SessionPage[] = [];
  for (const half of halves) {
    pages.push({ ...(await pageFromMaster(half, script, { enhance: spec.defaultEnhance })), splitFrom });
  }
  return pages;
}

function pagesLabel(n: number): string {
  return `${n} ${n === 1 ? 'page' : 'pages'}`;
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
  const { script, spec, ownsInputs, onScanMore } = options;
  const signal = beginProcessing();

  const result = await processSequentially(
    rawUris,
    (uri) => ingestOne(uri, { script, spec, ownsInputs }),
    {
      signal,
      onProgress: (progress) => dispatch({ type: 'capture/SET_PROGRESS', progress }),
      discardInput: ownsInputs ? (uri) => cleanTemporaryCache([uri]) : undefined,
    }
  );
  endProcessing(signal);

  dispatch({ type: 'capture/SET_PROGRESS', progress: null });
  const pages: SessionPage[] = result.items.flat();
  if (pages.length > 0) dispatch({ type: 'capture/BULK_ADD_PAGES', pages });

  if (result.error !== undefined) {
    hapticWarning();
    const failedPage = (result.failedIndex ?? 0) + 1;
    dispatch({
      type: 'capture/SET_PROCESSING_STATUS',
      status: 'error',
      errorMessage:
        pages.length > 0
          ? `Couldn't process page ${failedPage} · kept ${pagesLabel(pages.length)}`
          : `Couldn't process page ${failedPage}`,
    });
    return;
  }

  if (result.cancelled) {
    dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    dispatch({ type: 'ui/SHOW_SNACK', msg: `Stopped · kept ${pagesLabel(pages.length)}` });
    return;
  }

  hapticSuccess();
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'success' });
  dispatch({
    type: 'ui/SHOW_SNACK',
    msg: `Added ${pagesLabel(pages.length)}`,
    ...(onScanMore ? { action: 'Scan more', onAction: onScanMore } : null),
  });
}

// Our Gallery button. (C5 adds automatic edge detection and cropping per photo.)
export async function ingestGalleryBatch(
  dispatch: Dispatch<AppAction>,
  uris: readonly string[],
  script: OcrScript,
  spec: CaptureModeSpec
): Promise<void> {
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });
  await ingestBatch(dispatch, uris, { script, spec, ownsInputs: false });
}
