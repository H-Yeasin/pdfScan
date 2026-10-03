import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { classifyPdfError, resumePage } from '../../services/documents/readerPosition';
import { isPageRasterFormat } from '../../services/documents/formatCapabilities';
import { ensureDocumentPdf } from '../../services/pdf/pdfService';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';

// §7 R4: how long the page must stay on screen before it's saved as "where I left off".
const LAST_PAGE_SAVE_MS = 800;

// §7 R4: how the last load failed. 'password': the prompt says a password is needed (and, after
// a try, that it didn't work); 'damaged': no password can help - "Can't open this file".
export type LoadProblem = 'password' | 'wrongPassword' | 'unknown' | 'damaged' | null;

// The document the Reader shows (a library document or a file from outside), its files, and the
// viewer's state for it: page count and position, password, load problems, resume and "where I
// left off". `goToPage` is the viewer's (stable) jump.
export function useReaderDocument(goToPage: (page: number) => void) {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'reader');
  const external = state.reader.external;
  const doc = state.library.files.find((f) => f.id === state.reader.readerId);
  const format = external?.format ?? doc?.format;
  const isPageRaster = format ? isPageRasterFormat(format) : false;

  // pdfUri is reserved for the PdfPageView path (PDF/JPG - both are ultimately rendered from a
  // compiled PDF, see buildPdfFromPages). nativeUri is for every other format's own viewer, reading
  // straight from the copied source file instead of a PDF conversion that doesn't exist for them.
  const pdfUri = isPageRaster ? (external?.uri ?? doc?.pdfUri) : undefined;
  const nativeUri = !isPageRaster ? (external?.uri ?? doc?.contentUri) : undefined;
  const title = external?.name ?? doc?.name ?? '';
  const pdfId = external?.uri ?? doc?.id ?? '';
  const contentKey = pdfUri ?? nativeUri;

  const [pageCount, setPageCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [backfilling, setBackfilling] = useState(false);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loadProblem, setLoadProblem] = useState<LoadProblem>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // §7 R4: the saved page has been jumped to (or there was none); until then, page changes
  // (the viewer starting on page 1) aren't saved over it.
  const restored = useRef(false);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // §8 B1: the file to show was deleted outside the app (or a restore didn't bring it back). Said
  // plainly here, rather than left to the viewer to fail on. Re-checked when the integrity check
  // changes the document's flag.
  const fileMissing = useMemo(() => {
    if (!doc || external || !contentKey) return false;
    try {
      return !new File(contentKey).exists;
    } catch {
      return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, doc?.missingFiles, external]);

  // Backfills document.pdf for a library doc saved before every doc always got one. A no-op for
  // anything saved after that change shipped (doc.pdfUri is already set), and for any non-raster
  // format (DOCX/XLSX/CSV/TXT), which never gets a pdfUri at all - ensureDocumentPdf assumes a
  // pages[] of real raster images to compile, which those formats don't have.
  useEffect(() => {
    if (!doc || external || doc.pdfUri || !isPageRaster) return;
    let cancelled = false;
    setBackfilling(true);
    ensureDocumentPdf(doc).then((updated) => {
      if (cancelled) return;
      dispatch({ type: 'library/UPDATE_FILE', id: updated.id, patch: updated });
      setBackfilling(false);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, external, isPageRaster, dispatch]);

  // Resets all per-document viewer state when a different document/external file is opened.
  useEffect(() => {
    setPageCount(0);
    setActiveIndex(0);
    setPassword(undefined);
    setPasswordDraft('');
    setNeedsPassword(false);
    setLoadProblem(null);
    setReloadKey(0);
    restored.current = false;
  }, [contentKey]);

  // §7 R4: resume where the student left off, once the PDF has loaded - unless a search hit or a
  // bookmark is being opened (the Reader's target effect handles that; it runs after this one, so
  // the target is still set here).
  useEffect(() => {
    if (pageCount === 0 || restored.current) return;
    restored.current = true;
    const page = doc && !external ? resumePage(doc.lastPage, pageCount, !!state.reader.target) : null;
    if (page) goToPage(page);
  }, [pageCount, doc, external, state.reader.target, goToPage]);

  // Saves the page on screen (debounced: flicking through pages writes once), and on leaving.
  const lastSeenPage = useRef<number | null>(null);
  const docId = !external ? doc?.id : undefined;
  useEffect(() => {
    if (!docId || pageCount === 0 || !restored.current) return;
    const page = activeIndex + 1;
    lastSeenPage.current = page;
    const timer = setTimeout(() => dispatch({ type: 'library/SET_LAST_PAGE', id: docId, page }), LAST_PAGE_SAVE_MS);
    return () => clearTimeout(timer);
  }, [docId, activeIndex, pageCount, dispatch]);
  useEffect(
    () => () => {
      if (docId && lastSeenPage.current) dispatch({ type: 'library/SET_LAST_PAGE', id: docId, page: lastSeenPage.current });
      lastSeenPage.current = null;
    },
    [docId, dispatch]
  );

  const handleLoad = useCallback((count: number) => {
    setPageCount(count);
    setNeedsPassword(false);
    setLoadProblem(null);
  }, []);

  const handlePageChanged = useCallback((page: number, count: number) => {
    setActiveIndex(page - 1);
    setPageCount(count);
  }, []);

  // §7 R4: pdf-jsi says when a password is missing or wrong (readerPosition.classifyPdfError);
  // any other failure is a file no password will open. With no message to go by, the prompt is
  // offered as before, and a failure after a password was tried is taken as a damaged file.
  const handlePdfError = useCallback(
    (message: string) => {
      const kind = classifyPdfError(message);
      const tried = password !== undefined;
      if (kind === 'damaged' || (kind === 'unknown' && tried)) {
        setNeedsPassword(false);
        setLoadProblem('damaged');
        return;
      }
      setLoadProblem(kind === 'password' ? (tried ? 'wrongPassword' : 'password') : 'unknown');
      setNeedsPassword(true);
    },
    [password]
  );

  const submitPassword = useCallback(() => {
    setPassword(passwordDraft);
    setNeedsPassword(false);
    setReloadKey((k) => k + 1);
  }, [passwordDraft]);

  return {
    doc,
    external,
    format,
    isPageRaster,
    pdfUri,
    nativeUri,
    title,
    pdfId,
    contentKey,
    fileMissing,
    backfilling,
    pageCount,
    activeIndex,
    password,
    passwordDraft,
    setPasswordDraft,
    needsPassword,
    loadProblem,
    reloadKey,
    reload,
    handleLoad,
    handlePageChanged,
    handlePdfError,
    submitPassword,
  };
}
