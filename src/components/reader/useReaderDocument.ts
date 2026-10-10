import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { useScreenRole } from '../../navigation/screenRole';
import { classifyPdfError, heldSubject, openingPage } from '../../services/documents/readerPosition';
import { isPageRasterFormat } from '../../services/documents/formatCapabilities';
import { pdfPageFor } from '../../services/documents/pageMap';
import { ensureDocumentPdfOnce } from '../../services/pdf/pdfService';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import type { ExternalFileDocument } from '../../types/models';

// §7 R4: how long the page must stay on screen before it's saved as "where I left off".
const LAST_PAGE_SAVE_MS = 800;

// §7 R4: how the last load failed. 'password': the prompt says a password is needed (and, after
// a try, that it didn't work); 'damaged': no password can help - "Can't open this file".
export type LoadProblem = 'password' | 'wrongPassword' | 'unknown' | 'damaged' | null;

// The document the Reader shows (a library document or a file from outside), its files, and the
// viewer's state for it: page count and position, password, load problems, the page to open on
// and "where I left off".
export function useReaderDocument() {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'reader');
  // §18 W5: only the Reader on screen follows the store and saves the position; one that is
  // hidden or sliding away keeps the document it had (readerPosition.heldSubject). `inert`: this
  // instance has never been on screen, so it has no document and the screen draws nothing.
  const role = useScreenRole();
  const live = role === 'active';
  const held = useRef<{ readerId: string | null; external: ExternalFileDocument | null } | null>(null);
  held.current = heldSubject(role, { readerId: state.reader.readerId, external: state.reader.external }, held.current);
  const inert = held.current === null;
  const readerId = held.current?.readerId ?? null;
  const external = held.current?.external ?? null;
  const doc = readerId ? state.library.files.find((f) => f.id === readerId) : undefined;
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

  // §18 W5: the page a viewer opening this file starts on, so it never shows page 1 first: the
  // search hit or bookmark being opened, else the saved page. Read when a viewer mounts
  // (PdfPageView keeps its first `initialPage`), so it may change freely afterwards.
  const target = live && doc && !external ? state.reader.target : null;
  const targetIdx = target && doc ? doc.pages.findIndex((p) => p.id === target.pageId) : -1;
  const firstPage = openingPage(doc && !external ? doc.lastPage : undefined, doc && targetIdx >= 0 ? pdfPageFor(doc, targetIdx).page : null);

  const [pageCount, setPageCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState((firstPage ?? 1) - 1);
  const [backfilling, setBackfilling] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const retryPreview = useCallback(() => setPreviewAttempt((n) => n + 1), []);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loadProblem, setLoadProblem] = useState<LoadProblem>(null);
  // The viewer is mounted again for each reload of a file (document.pdf rewritten by Edit pages
  // or Mark mode, a password to try). §18 W5: every reload says which page it opens on, and
  // belongs to one file, so opening another file starts from 0 in the same render (not one
  // render later, which mounted the new file's viewer twice).
  const [reloaded, setReloaded] = useState<{ contentKey: string | undefined; key: number; page: number | undefined } | null>(null);
  const thisReload = reloaded && reloaded.contentKey === contentKey ? reloaded : null;
  const reloadKey = thisReload?.key ?? 0;
  const initialPage = thisReload ? thisReload.page : firstPage;
  // §7 R4, §18 W5: the viewer has reported this file's pages; until then there is no position
  // to save (the page and count on hand may still be the last file's).
  const restored = useRef(false);
  const view = useRef({ contentKey, pageCount, activeIndex, initialPage });
  view.current = { contentKey, pageCount, activeIndex, initialPage };
  // Reloads the viewer on the page being read; `to` names another page, or works it out from
  // that one (Edit pages: where the page went).
  const reload = useCallback((to?: number | ((page: number) => number)) => {
    const now = view.current;
    // Not loaded yet (a password being tried): the page it was opening on.
    const here = now.pageCount > 0 ? now.activeIndex + 1 : now.initialPage;
    const page = typeof to === 'function' ? to(here ?? 1) : (to ?? here);
    // The top bar says it at once, and it is what gets saved when the viewer reports nothing new.
    if (page) setActiveIndex(page - 1);
    setReloaded((prev) => ({ contentKey: now.contentKey, key: (prev && prev.contentKey === now.contentKey ? prev.key : 0) + 1, page }));
  }, []);

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
  // §18 W3: a build that fails (a master is gone, the disk is full) ends in `previewFailed` with a
  // Retry, instead of "Preparing preview…" for ever. Keyed on the document's id, not the document:
  // this effect must not start again each time the store hands over a new object for the same
  // document (ensureDocumentPdfOnce also shares a build that is already running).
  const needsPdf = !!doc && !external && !doc.pdfUri && isPageRaster;
  const backfillId = needsPdf ? doc.id : undefined;
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  useEffect(() => {
    const target = latestDoc.current;
    if (!backfillId || !target) return;
    let cancelled = false;
    setBackfilling(true);
    setPreviewFailed(false);
    ensureDocumentPdfOnce(target)
      .then((updated) => {
        if (cancelled) return;
        dispatch({ type: 'library/UPDATE_FILE', id: updated.id, patch: updated });
        setBackfilling(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('useReaderDocument: could not prepare the preview', backfillId, error);
        setBackfilling(false);
        setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [backfillId, previewAttempt, dispatch]);

  // Resets all per-document viewer state when a different document/external file is opened.
  useEffect(() => {
    setPageCount(0);
    setActiveIndex((view.current.initialPage ?? 1) - 1);
    setPassword(undefined);
    setPasswordDraft('');
    setNeedsPassword(false);
    setLoadProblem(null);
    setReloaded(null);
    restored.current = false;
  }, [contentKey]);

  // Saves the page on screen (debounced: flicking through pages writes once), and at once when
  // the Reader leaves the screen, shows another document or unmounts. §18 W5: only the Reader on
  // screen does (a hidden one's page events aren't the student reading), and only after its
  // viewer has loaded: Back while a document is still opening leaves the saved page alone.
  const lastSeenPage = useRef<number | null>(null);
  const docId = !external ? doc?.id : undefined;
  useEffect(() => {
    if (!live || !docId || pageCount === 0 || !restored.current) return;
    const page = activeIndex + 1;
    lastSeenPage.current = page;
    const timer = setTimeout(() => dispatch({ type: 'library/SET_LAST_PAGE', id: docId, page }), LAST_PAGE_SAVE_MS);
    return () => clearTimeout(timer);
  }, [live, docId, activeIndex, pageCount, dispatch]);
  useEffect(() => {
    if (!live || !docId) return;
    return () => {
      if (lastSeenPage.current) dispatch({ type: 'library/SET_LAST_PAGE', id: docId, page: lastSeenPage.current });
      lastSeenPage.current = null;
    };
  }, [live, docId, dispatch]);

  const handleLoad = useCallback((count: number) => {
    restored.current = true;
    setPageCount(count);
    setNeedsPassword(false);
    setLoadProblem(null);
    // A saved page past the end (pages deleted since, §7 R3): the viewer opened on its last page.
    setActiveIndex((idx) => (count > 0 && idx > count - 1 ? count - 1 : idx));
  }, []);

  const handlePageChanged = useCallback((page: number, count: number) => {
    restored.current = true;
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
    reload();
  }, [passwordDraft, reload]);

  return {
    inert,
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
    previewFailed,
    retryPreview,
    pageCount,
    activeIndex,
    password,
    passwordDraft,
    setPasswordDraft,
    needsPassword,
    loadProblem,
    reloadKey,
    initialPage,
    reload,
    handleLoad,
    handlePageChanged,
    handlePdfError,
    submitPassword,
  };
}
