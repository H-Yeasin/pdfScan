import { t } from '../../i18n';
import type { CaptureMode, DocFormat, DocType, LibraryDocument, LibraryPage, OcrScript, PageLayout, PageOcr, SessionPage } from '../../types/models';
import { ocrFitsPage } from '../capture/geometryKey';
import { DEFAULT_ADJUST } from '../enhance/adjust';
import { formatLimit } from '../submit/sizeFormat';
import type { ExportPreset } from '../capture/imageSpec';
import type { AcademicConfig, LayoutMode } from '../pdf/pdfService';
import type { PageSizeId } from '../pdf/pageSize';
import type { SizedBuild } from '../submit/sizeTarget';

// §17 U9: the scan session → a library document, out of DeliverScreen (it was its
// handleSaveInternal). The screen collects the options and shows the progress; this does the work,
// with everything that touches files, Skia, OCR or pdf-lib passed in as `deps`, so Jest runs it
// with fakes (loadSaveScanDeps() gives the real ones, required on first use: they are heavy, and
// this file is imported by the Save screen only).
//
// One page at a time (never Promise.all): each page is rendered from its session master in a
// single Skia pass (rotation + filter + resize + one JPEG encode) - once at master spec for the
// library, and once more at the export preset only if that differs. The text is the one read at
// scan time while it still fits the page (§16 G7), else OCR of the final master, so the PDF's
// text layer always lines up with what was saved, whatever was rotated or cropped in Review.
//
// Nothing is half-saved: a failure deletes the document's folder and the renders made for it,
// and leaves the session's own files, so the student can try again. The session's files go only
// once the document is complete.

export type SaveScanOptions = {
  documentId: string;
  pages: readonly SessionPage[];
  name: string;
  format: DocFormat;
  mode: CaptureMode;
  courseId: string | null;
  docType: DocType;
  // 1-5 (imageSpec's export presets).
  quality: number;
  // The library copy is fitted under this many bytes; null: `quality` decides.
  sizeLimit: number | null;
  // Cover, border, header and footer; null for none (and for pages added to a saved document).
  academic: AcademicConfig | null;
  layout: LayoutMode;
  pageSize: PageSizeId;
  ocrScript: OcrScript;
  // Images only Review's undo history still points at (pageHistory.historyUris). The session ends
  // with this save, so they go with it.
  historyUris: readonly string[];
};

export type SaveScanDeps = {
  renderPage: typeof import('../enhance/skiaEnhance').renderPage;
  runOcr: (uri: string, script: OcrScript) => Promise<PageOcr | undefined>;
  stampContentPageImage: typeof import('../pdf/academicRasterService').stampContentPageImage;
  renderCoverPageImage: typeof import('../pdf/academicRasterService').renderCoverPageImage;
  buildPdfFromPages: typeof import('../pdf/pdfService').buildPdfFromPages;
  buildPdfUnderLimit: typeof import('../submit/sizeTarget').buildPdfUnderLimit;
  saveImagesToLibrary: typeof import('../export/imageExportService').saveImagesToLibrary;
  encodingForQuality: (quality: number) => 'as-is' | ExportPreset;
  masterPreset: ExportPreset;
  cleanTemporaryCache: (uris: string[]) => void;
  deleteDocumentFiles: (documentId: string) => void;
  createId: (prefix: string) => string;
  now: () => number;
};

export type SaveScanResult = {
  doc: LibraryDocument;
  // Set when a size limit was asked for and even the smallest build is over it: saved all the
  // same; the screen says so (sizeTarget.tooLargeMessage).
  oversize: Pick<SizedBuild, 'sizeBytes' | 'level'> | null;
};

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

// Every file of the session itself: masters, thumbnails, the spread a Book half was cut from and
// an ID card's scanned sides, plus what only the undo history holds.
export function sessionUris(pages: readonly SessionPage[], historyUris: readonly string[]): string[] {
  const uris = new Set<string>(historyUris);
  for (const page of pages) {
    uris.add(page.uri);
    if (page.thumbUri) uris.add(page.thumbUri);
    if (page.idCard) {
      uris.add(page.idCard.front.uri);
      if (page.idCard.back) uris.add(page.idCard.back.uri);
    }
    if (page.splitFrom) {
      uris.add(page.splitFrom.uri);
      if (page.splitFrom.thumbUri) uris.add(page.splitFrom.thumbUri);
    }
  }
  return Array.from(uris);
}

export async function saveScan(options: SaveScanOptions, deps: SaveScanDeps, onProgress: (message: string) => void = () => {}): Promise<SaveScanResult> {
  const { documentId, pages, format, academic, layout, pageSize, sizeLimit, ocrScript } = options;
  if (pages.length === 0) throw new Error('saveScan: no pages');
  // With a size target the level isn't known until every master exists, so the loop renders
  // masters only and buildPdfUnderLimit encodes the PDF's pages itself.
  const encoding = sizeLimit !== null ? 'as-is' : deps.encodingForQuality(options.quality);
  const total = pages.length;
  // Renders made for this save that end up nowhere (export copies), and the ones that would be
  // left behind by a failure (masters, stamped copies, a rendered cover) until they are placed.
  const transient = new Set<string>();
  const made = new Set<string>();

  try {
    const contentPages: (LibraryInputPage & { exportUri: string })[] = [];
    for (let i = 0; i < total; i++) {
      const page = pages[i];
      onProgress(t('deliver.progress.preparing', { current: i + 1, total }));
      const edits = {
        rotation: page.rotation,
        enhance: page.enhance,
        adjust: page.adjust ?? DEFAULT_ADJUST,
        stats: page.stats,
        filterOptions: page.filterOptions,
      };
      const master = await deps.renderPage(page.uri, edits, deps.masterPreset);
      made.add(master.uri);
      const exported = encoding === 'as-is' ? master : await deps.renderPage(page.uri, edits, encoding);
      if (exported !== master) transient.add(exported.uri);
      // §16 G7: the text read at scan time still describes this page when nothing but its look
      // changed since (same image, unturned, same script: geometryKey.ts) and the saved master has
      // the same pixels across, so its word boxes land where they did. Anything else - a turn, a
      // text read for another script, no text yet - is read from the master.
      const keepText = ocrFitsPage(page, ocrScript) && master.width === page.width && master.height === page.height;
      const ocr = keepText ? page.ocr : await deps.runOcr(master.uri, ocrScript);
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

    // The Reader shows each LibraryPage's own image, not the compiled PDF, so an academic
    // border/header-footer also needs to exist as pixels - on a separate display copy, so the
    // master stays clean for later rebuilds. The PDF itself gets the crisp vector version.
    let coverPage: LibraryInputPage | null = null;
    if (format === 'PDF' && academic) {
      if (academic.enableBorder || academic.headerText || academic.footerText) {
        for (let i = 0; i < contentPages.length; i++) {
          onProgress(t('deliver.progress.stamping', { current: i + 1, total }));
          const stamped = await deps.stampContentPageImage(contentPages[i].masterUri, academic, i + 1, total);
          made.add(stamped.uri);
          contentPages[i].displayUri = stamped.uri;
        }
      }
      if (academic.coverPage) {
        const rendered = await deps.renderCoverPageImage(academic.coverPage, pageSize);
        if (rendered) {
          // An imported cover is the user's own picked file - copy it, don't move it (or delete it).
          const keepSource = academic.coverPage.mode === 'imported_image' && rendered.uri === academic.coverPage.importedUri;
          if (!keepSource) made.add(rendered.uri);
          coverPage = { id: deps.createId('page'), masterUri: rendered.uri, width: rendered.width, height: rendered.height, keepSource };
        }
      }
    }

    // Always a document.pdf, whatever the export `format`: the Reader shows every library document
    // through the PDF engine, so a JPG-format document needs a real PDF behind it too. The pages
    // are already encoded for export, so they go in as-is.
    const pdfPages = contentPages.map((p) => ({ uri: p.exportUri, width: p.width, height: p.height, ocr: p.ocr, layout: p.layout }));
    let pdf: { uri: string; sizeBytes: number };
    let oversize: SaveScanResult['oversize'] = null;
    if (sizeLimit !== null) {
      onProgress(t('deliver.progress.fitting', { size: formatLimit(sizeLimit) }));
      const sized = await deps.buildPdfUnderLimit(documentId, pdfPages, sizeLimit, academic ?? undefined, layout, pageSize);
      if (!sized.fits) oversize = sized;
      pdf = sized;
    } else {
      onProgress(t('deliver.progress.building'));
      pdf = await deps.buildPdfFromPages(documentId, pdfPages, 'as-is', academic ?? undefined, layout, pageSize);
    }

    const libraryInputPages = coverPage ? [coverPage, ...contentPages] : contentPages;
    const saved = await deps.saveImagesToLibrary(
      documentId,
      libraryInputPages.map((p) => ({ masterUri: p.masterUri, displayUri: p.displayUri, keepSource: p.keepSource }))
    );
    // Moved into the document's folder: no longer ours to clean up on a failure.
    made.clear();

    const libraryPages: LibraryPage[] = libraryInputPages.map((page, i) => ({
      id: page.id,
      ...saved.pages[i],
      width: page.width,
      height: page.height,
      ocr: page.ocr,
      ocrFailed: page.ocrFailed || undefined,
      layout: page.layout,
    }));

    const doc: LibraryDocument = {
      id: documentId,
      name: options.name,
      format,
      mode: options.mode,
      pages: libraryPages,
      pdfUri: pdf.uri,
      sizeBytes: format === 'PDF' ? pdf.sizeBytes : saved.sizeBytes,
      createdAt: deps.now(),
      star: false,
      tag: options.name.slice(0, 4).toUpperCase(),
      locked: false,
      courseId: options.courseId ?? undefined,
      docType: options.docType,
      // Only set when a cover page actually made it into libraryPages[0].
      coverKind: coverPage ? academic?.coverPage?.mode : undefined,
      // §5 T1: how document.pdf was laid out, for mapping library pages onto it.
      pdfLayout: layout === '2_in_1' ? '2_in_1' : 'standard',
      pdfPageSize: pageSize,
    };

    // The session's own files and the export-only renders are superseded by the library copies.
    deps.cleanTemporaryCache([...transient, ...sessionUris(pages, options.historyUris)]);
    return { doc, oversize };
  } catch (error) {
    deps.deleteDocumentFiles(documentId);
    deps.cleanTemporaryCache([...transient, ...made]);
    throw error;
  }
}

// The real dependencies, required here so the screen's first render doesn't wait for pdf-lib.
export function loadSaveScanDeps(): SaveScanDeps {
  const { renderPage } = require('../enhance/skiaEnhance') as typeof import('../enhance/skiaEnhance');
  const { runOcr } = require('../ocr/ocrService') as typeof import('../ocr/ocrService');
  const raster = require('../pdf/academicRasterService') as typeof import('../pdf/academicRasterService');
  const pdfService = require('../pdf/pdfService') as typeof import('../pdf/pdfService');
  const { buildPdfUnderLimit } = require('../submit/sizeTarget') as typeof import('../submit/sizeTarget');
  const { saveImagesToLibrary } = require('../export/imageExportService') as typeof import('../export/imageExportService');
  const files = require('../persistence/libraryFiles') as typeof import('../persistence/libraryFiles');
  const { MASTER_PRESET } = require('../capture/imageSpec') as typeof import('../capture/imageSpec');
  const { createId } = require('../../utils/id') as typeof import('../../utils/id');
  return {
    renderPage,
    runOcr,
    stampContentPageImage: raster.stampContentPageImage,
    renderCoverPageImage: raster.renderCoverPageImage,
    buildPdfFromPages: pdfService.buildPdfFromPages,
    buildPdfUnderLimit,
    saveImagesToLibrary,
    encodingForQuality: pdfService.encodingForQuality,
    masterPreset: MASTER_PRESET,
    cleanTemporaryCache: files.cleanTemporaryCache,
    deleteDocumentFiles: files.deleteDocumentFiles,
    createId,
    now: Date.now,
  };
}
