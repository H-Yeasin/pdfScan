import type { CaptureMode, EnhanceMode, OcrScript, SessionPage } from '../../types/models';
import { getCaptureModeSpec } from './captureModes';

// §17 U9: the mode can change after scanning (Review's Mode sheet). The session is made again as
// if it had been scanned in the new mode:
//  1. the old mode's post-processing is taken back: a Book spread whose two halves are both still
//     here is one page again, an ID card page is its scanned front and back again;
//  2. a page still on the old mode's default filter takes the new one's (a filter the student
//     picked stays);
//  3. the new mode's post-processing runs: Book splits each spread, ID card composes the plain
//     pages in pairs.
// Nothing here touches a file that exists: halves and composed cards are new files, and a
// spread or card images taken back are the ones kept on the page. The old pages stay in Review's
// undo history (capture/APPLY_MODE is one 'pages' entry), so Undo puts them back with the mode.
// The document type follows by itself: deliver.docType null means the mode's default.

export type ReapplyDeps = {
  // ingestBatch.splitSpreadPage: the halves, or null when the page stays as it is.
  splitSpreadPage: (page: SessionPage, script: OcrScript, enhance: EnhanceMode) => Promise<SessionPage[] | null>;
  // idCardPages.composeIdCardPages with keepThumbs (undo still shows them).
  composeIdCardPages: (pages: SessionPage[], script: OcrScript) => Promise<SessionPage[]>;
  createId: (prefix: string) => string;
};

export type ReapplyInput = {
  pages: SessionPage[];
  from: CaptureMode;
  to: CaptureMode;
  // Each mode's default filter as the student has it (settingsSlice.defaultEnhanceFor).
  fromEnhance: EnhanceMode;
  toEnhance: EnhanceMode;
  script: OcrScript;
};

// Step 1. A spread with a half deleted stays as halves: joining it would bring the deleted half back.
export function undoPostProcess(pages: SessionPage[], createId: ReapplyDeps['createId']): SessionPage[] {
  const halvesOf = new Map<string, number>();
  for (const page of pages) {
    const group = page.splitFrom?.groupId;
    if (group) halvesOf.set(group, (halvesOf.get(group) ?? 0) + 1);
  }
  const out: SessionPage[] = [];
  const joined = new Set<string>();
  for (const page of pages) {
    const from = page.splitFrom;
    if (from && halvesOf.get(from.groupId) === 2) {
      if (joined.has(from.groupId)) continue;
      joined.add(from.groupId);
      // As capture/UNSPLIT does: the spread at the first half's place, with its look.
      out.push({
        id: createId('page'),
        uri: from.uri,
        thumbUri: from.thumbUri,
        width: from.width,
        height: from.height,
        rotation: 0,
        enhance: page.enhance,
        adjust: page.adjust,
        filterOptions: page.filterOptions,
      });
      continue;
    }
    if (page.idCard) {
      // The card images have no thumbnail of their own; strips fall back to the image.
      for (const side of page.idCard.back ? [page.idCard.front, page.idCard.back] : [page.idCard.front]) {
        out.push({ id: createId('page'), uri: side.uri, width: side.width, height: side.height, rotation: 0, enhance: page.enhance, adjust: page.adjust, filterOptions: page.filterOptions });
      }
      continue;
    }
    out.push(page);
  }
  return out;
}

export async function reapplyMode(input: ReapplyInput, deps: ReapplyDeps): Promise<SessionPage[]> {
  const { from, to, fromEnhance, toEnhance, script } = input;
  if (from === to) return input.pages;
  const spec = getCaptureModeSpec(to);
  const before = getCaptureModeSpec(from);

  let pages = before.postProcess === 'none' ? input.pages : undoPostProcess(input.pages, deps.createId);
  if (fromEnhance !== toEnhance) {
    pages = pages.map((page) => (page.enhance === fromEnhance ? { ...page, enhance: toEnhance } : page));
  }

  if (spec.postProcess === 'splitSpread') {
    const out: SessionPage[] = [];
    // One page at a time (AGENTS.md): a split decodes the whole spread.
    for (const page of pages) out.push(...((await deps.splitSpreadPage(page, script, page.enhance)) ?? [page]));
    pages = out;
  } else if (spec.postProcess === 'idCard') {
    // Pairs of plain pages, front then back; a page that is already a card keeps its place.
    const out: SessionPage[] = [];
    let run: SessionPage[] = [];
    const flush = async () => {
      if (run.length) out.push(...(await deps.composeIdCardPages(run, script)));
      run = [];
    };
    for (const page of pages) {
      if (page.idCard) {
        await flush();
        out.push(page);
      } else {
        run.push(page);
      }
    }
    await flush();
    pages = out;
  }
  return pages;
}
