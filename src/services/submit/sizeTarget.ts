import { File } from 'expo-file-system';
import { SIZE_LADDER } from '../capture/imageSpec';
import { encodedBytes } from '../enhance/skiaEnhance';
import { buildPdfFromPages, type AcademicConfig, type LayoutMode, type PdfSourcePage } from '../pdf/pdfService';

// Upload forms count a megabyte as 1,000,000 bytes, so the limits here do too (unlike
// utils/format.formatBytes, which divides by 1024 for storage sizes).
export const MB = 1_000_000;

// What a scan PDF adds on top of its page images: fonts, structure, the cover page and footer
// text (about 4 KB measured), and per page the page objects plus the invisible OCR text (0.3 to
// 1.1 KB measured for 0 to 60 lines). Rounded up well past that; sizeTarget.test.ts checks real
// builds stay under these.
export const PDF_OVERHEAD_BYTES = 8_000;
export const PDF_OVERHEAD_PER_PAGE_BYTES = 2_000;

// Aim this far under the limit, so a page that compresses worse than the samples doesn't tip
// the file over.
export const SAFETY_MARGIN = 0.05;

export const LOWEST_LEVEL = SIZE_LADDER.length - 1;

export function pdfOverheadBytes(pageCount: number, extraBytes = 0): number {
  return PDF_OVERHEAD_BYTES + PDF_OVERHEAD_PER_PAGE_BYTES * pageCount + extraBytes;
}

// Which pages to sample: the first, the middle and the largest master (the one most likely to
// blow the limit), without repeats.
export function samplePageIndexes(masterBytes: readonly number[]): number[] {
  if (masterBytes.length === 0) return [];
  let largest = 0;
  masterBytes.forEach((bytes, i) => {
    if (bytes > masterBytes[largest]) largest = i;
  });
  return [...new Set([0, Math.floor((masterBytes.length - 1) / 2), largest])].sort((a, b) => a - b);
}

// The whole PDF at one level: the mean sampled page size for every page, plus the overhead.
export function predictedBytes(levelSamples: readonly number[], pageCount: number, overheadBytes: number): number {
  const mean = levelSamples.length === 0 ? 0 : levelSamples.reduce((sum, bytes) => sum + bytes, 0) / levelSamples.length;
  return mean * pageCount + overheadBytes;
}

function fits(levelSamples: readonly number[], pageCount: number, overheadBytes: number, limitBytes: number): boolean {
  return predictedBytes(levelSamples, pageCount, overheadBytes) <= limitBytes * (1 - SAFETY_MARGIN);
}

// The best level whose predicted total fits under the limit with the safety margin.
// `samples[level]` holds the encoded size of each sampled page at that level. When nothing
// fits, the lowest level: buildUnderLimit then reports that it doesn't fit.
export function predictLevel(samples: readonly (readonly number[])[], pageCount: number, overheadBytes: number, limitBytes: number): number {
  for (let level = 0; level < samples.length; level++) {
    if (fits(samples[level], pageCount, overheadBytes, limitBytes)) return level;
  }
  return Math.max(0, samples.length - 1);
}

// predictLevel without encoding the sample pages at every level: a smaller level never makes a
// bigger file, so a binary search over the ladder needs only about 4 of its 9 levels measured.
// `measure(level)` returns the sampled pages' sizes at that level.
export async function findLevel(
  measure: (level: number) => Promise<number[]>,
  pageCount: number,
  overheadBytes: number,
  limitBytes: number,
  levelCount = SIZE_LADDER.length
): Promise<number> {
  let lo = 0;
  let hi = levelCount - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(await measure(mid), pageCount, overheadBytes, limitBytes)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export type BuiltFile = { uri: string; sizeBytes: number };
export type SizedBuild = BuiltFile & { level: number; fits: boolean; builds: number };

export const MAX_BUILDS = 3;

// Builds at the predicted level and, if the file is still over the limit, one level lower, at
// most MAX_BUILDS times in all. Each build replaces the previous file, and a lower level gives a
// smaller file, so the result is always the smallest one made, with `fits: false` if even that
// is over the limit.
export async function buildUnderLimit(
  build: (level: number) => Promise<BuiltFile>,
  startLevel: number,
  limitBytes: number,
  lowestLevel = LOWEST_LEVEL
): Promise<SizedBuild> {
  let level = Math.min(Math.max(0, startLevel), lowestLevel);
  let builds = 0;
  for (;;) {
    const file = await build(level);
    builds += 1;
    const ok = file.sizeBytes <= limitBytes;
    if (ok || builds >= MAX_BUILDS || level >= lowestLevel) return { ...file, level, fits: ok, builds };
    level += 1;
  }
}

// "2 MB", "1.5 MB", "800 KB": a limit or a result, in the units the limit was given in.
// Rounded up, so a file just over a 2 MB limit reads "2.01 MB", never "2 MB".
export function formatLimit(bytes: number): string {
  if (bytes < MB) return `${Math.ceil(bytes / 1000)} KB`;
  return `${Math.ceil((bytes / MB) * 100) / 100} MB`;
}

// Shown after a save that couldn't get under the limit; the file is still saved.
export function tooLargeMessage(result: Pick<SizedBuild, 'sizeBytes' | 'level'>, limitBytes: number, lowestLevel = LOWEST_LEVEL): string {
  const size = formatLimit(result.sizeBytes);
  const limit = formatLimit(limitBytes);
  return result.level >= lowestLevel
    ? `This scan is too large for ${limit} even at the lowest quality (${size}). Remove pages or choose a bigger limit.`
    : `Couldn't get this scan under ${limit} (${size}). Remove pages or choose a bigger limit.`;
}

// Builds the document's PDF from final master pages (rotation and filters already applied) so it
// fits under `limitBytes`: samples a few pages at the levels the binary search asks for, one
// encode at a time and in memory, then builds at the predicted level and steps down if needed.
// Level 0 embeds the masters as they are.
export async function buildPdfUnderLimit(
  documentId: string,
  pages: PdfSourcePage[],
  limitBytes: number,
  academicConfig?: AcademicConfig,
  layoutMode: LayoutMode = 'standard'
): Promise<SizedBuild> {
  const masterBytes = pages.map((page) => new File(page.uri).size);
  const sampled = samplePageIndexes(masterBytes);
  const measure = async (level: number) => {
    const sizes: number[] = [];
    for (const i of sampled) {
      sizes.push(level === 0 ? masterBytes[i] : await encodedBytes(pages[i].uri, {}, SIZE_LADDER[level]));
    }
    return sizes;
  };
  // An imported cover image goes into the PDF as it is; a template cover is in the base overhead.
  const cover = academicConfig?.coverPage;
  const coverBytes = cover?.mode === 'imported_image' && cover.importedUri ? new File(cover.importedUri).size : 0;
  const overhead = pdfOverheadBytes(pages.length, coverBytes);

  const start = await findLevel(measure, pages.length, overhead, limitBytes);
  return buildUnderLimit(
    (level) => buildPdfFromPages(documentId, pages, level === 0 ? 'as-is' : SIZE_LADDER[level], academicConfig, layoutMode),
    start,
    limitBytes
  );
}
