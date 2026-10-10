import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { useScreenRole } from '../../navigation/screenRole';
import { externalPositionKey, loadExternalPosition, saveExternalPosition } from '../../services/documents/externalPositions';
import { classifyNativePdfError, heldSubject, openingPage, resumeSpot, viewerPositionFor, type NativePdfErrorCode } from '../../services/documents/readerPosition';
import { isPageRasterFormat, isPdfLevel } from '../../services/documents/formatCapabilities';
import { pdfPageFor } from '../../services/documents/pageMap';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import type { ExternalFileDocument, LibraryDocument, ReaderPosition } from '../../types/models';

// §7 R4: how long the page must stay on screen before it's saved as "where I left off".
const LAST_PAGE_SAVE_MS = 800;

// §7 R4: how the last load failed. 'password': the prompt says a password is needed (and, after
// a try, that it didn't work); 'damaged': no password can help - "Can't open this file".
export type LoadProblem = 'password' | 'wrongPassword' | 'damaged' | null;

// What the Reader has open: a library document, or a file from outside.
export type ReaderOpenSubject = { doc: LibraryDocument | undefined; external: ExternalFileDocument | null };

// The subject's files and names.
export function readerFiles({ doc, external }: ReaderOpenSubject) {
  const format = external?.format ?? doc?.format;
  const isPageRaster = format ? isPageRasterFormat(format) : false;
  // pdfUri is for the page surface's formats (PDF/JPG): an imported PDF or an outside file is
  // read from it; a scan is read from its page images, and its `document.pdf` is only what leaves
  // the app (§18 W17: it may not exist yet). nativeUri is for every other format's own viewer,
  // reading straight from the copied source file.
  const pdfUri = isPageRaster ? (external?.uri ?? doc?.pdfUri) : undefined;
  const nativeUri = !isPageRaster ? (external?.uri ?? doc?.contentUri) : undefined;
  const title = external?.name ?? doc?.name ?? '';
  const pdfId = external?.uri ?? doc?.id ?? '';
  return { format, isPageRaster, pdfUri, nativeUri, title, pdfId, contentKey: pdfUri ?? nativeUri };
}

// §18 W5: the document this Reader instance shows. Only the Reader on screen follows the store;
// one that is hidden or sliding away keeps the document it had (readerPosition.heldSubject).
// `inert`: this instance has never been on screen, so it has no document and draws nothing.
// §18 W6: `viewKey` names the file on screen. ReaderScreen keys ReaderDocumentView on it, so
// another file starts with fresh viewer state: position, password, Find, sheets, tools.
export function useReaderSubject() {
  const state = useAppSlices('library', 'reader');
  const role = useScreenRole();
  const held = useRef<{ readerId: string | null; external: ExternalFileDocument | null } | null>(null);
  held.current = heldSubject(role, { readerId: state.reader.readerId, external: state.reader.external }, held.current);
  const inert = held.current === null;
  const readerId = held.current?.readerId ?? null;
  const external = held.current?.external ?? null;
  const doc = readerId ? state.library.files.find((f) => f.id === readerId) : undefined;
  const { contentKey, pdfId } = readerFiles({ doc, external });
  return { inert, doc, external, viewKey: contentKey ?? pdfId };
}

// The viewer's state for the file the Reader shows: page count and position, password, load
// problems, the page to open on and "where I left off". One instance per file (§18 W6: the
// caller is keyed on useReaderSubject's `viewKey`), so nothing here resets for another file.
export function useReaderDocument({ doc, external }: ReaderOpenSubject) {
  const dispatch = useAppDispatch();
  const state = useAppSlices('reader');
  const live = useScreenRole() === 'active';
  const { format, isPageRaster, pdfUri, nativeUri, title, pdfId, contentKey } = readerFiles({ doc, external });

  // §18 W5: the page a viewer opening this file starts on, so it never shows page 1 first: the
  // search hit or bookmark being opened, else the saved page. Read when a viewer mounts
  // (PageSurface keeps its first `initialIndex`), so it may change freely afterwards.
  const target = live && doc && !external ? state.reader.target : null;
  const targetIdx = target && doc ? doc.pages.findIndex((p) => p.id === target.pageId) : -1;

  // §18 W19 (A12): the exact position this file was left at, as it was when the Reader opened it
  // (the saved one changes while reading). A library document's is in its row; an outside file's
  // is in the list of the last ones read (documents/externalPositions), which has to be read
  // first: until then `positionReady` is false and no viewer is mounted. null: not read yet.
  const externalKey = external ? externalPositionKey(external) : null;
  const [opened, setOpened] = useState<{ position: ReaderPosition | undefined } | null>(() => (external ? null : { position: doc?.lastPosition }));
  useEffect(() => {
    if (!externalKey) return;
    let cancelled = false;
    void loadExternalPosition(externalKey).then((position) => {
      if (!cancelled) setOpened({ position });
    });
    return () => {
      cancelled = true;
    };
  }, [externalKey]);
  // The page surface's: a library page (0-based) and how far down it. A search hit or bookmark
  // being opened wins over it.
  const spot = isPageRaster && targetIdx < 0 ? resumeSpot(external ? undefined : doc, opened?.position) : undefined;
  const spotPage = !spot
    ? undefined
    : doc && !external && !isPdfLevel(doc) && doc.pages.length > 0
      ? pdfPageFor(doc, Math.min(spot.index, doc.pages.length - 1)).page
      : spot.index + 1;
  const firstPage =
    spotPage !== undefined
      ? openingPage(spotPage)
      : openingPage(doc && !external ? doc.lastPage : undefined, doc && targetIdx >= 0 ? pdfPageFor(doc, targetIdx).page : null);

  const [pageCount, setPageCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState((firstPage ?? 1) - 1);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loadProblem, setLoadProblem] = useState<LoadProblem>(null);
  // The viewer is mounted again for each reload of the file (document.pdf rewritten by Edit
  // pages, a password to try). §18 W5: every reload says which page it opens on.
  const [reloaded, setReloaded] = useState<{ key: number; page: number | undefined } | null>(null);
  const reloadKey = reloaded?.key ?? 0;
  const initialPage = reloaded ? reloaded.page : firstPage;
  // §7 R4, §18 W5: the viewer has reported this file's pages; until then there is no position
  // to save.
  const restored = useRef(false);
  const view = useRef({ pageCount, activeIndex, initialPage });
  view.current = { pageCount, activeIndex, initialPage };
  // Reloads the viewer on the page being read; `to` names another page, or works it out from
  // that one (Edit pages: where the page went).
  const reload = useCallback((to?: number | ((page: number) => number)) => {
    const now = view.current;
    // Not loaded yet (a password being tried): the page it was opening on.
    const here = now.pageCount > 0 ? now.activeIndex + 1 : now.initialPage;
    const page = typeof to === 'function' ? to(here ?? 1) : (to ?? here);
    // The top bar says it at once, and it is what gets saved when the viewer reports nothing new.
    if (page) setActiveIndex(page - 1);
    setReloaded((prev) => ({ key: (prev?.key ?? 0) + 1, page }));
  }, []);

  // §8 B1: the file to show was deleted outside the app (or a restore didn't bring it back). Said
  // plainly here, rather than left to the viewer to fail on. Re-checked when the integrity check
  // changes the document's flag. §18 W17: a scan with no PDF yet is not missing anything (it is
  // read from its page images); an imported PDF without its file is.
  const fileMissing = useMemo(() => {
    if (!doc || external) return false;
    if (!contentKey) return isPageRaster && isPdfLevel(doc);
    try {
      return !new File(contentKey).exists;
    } catch {
      return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, doc?.missingFiles, external]);

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

  // §18 W19: the exact position, for every format: the viewer says where reading is as it moves,
  // and it is saved once it has rested there, and at once when the Reader leaves the screen. Only
  // the Reader on screen saves (as above). A library document's goes into its row, an outside
  // file's into the list.
  const pendingPosition = useRef<ReaderPosition | null>(null);
  const latestPosition = useRef<ReaderPosition | undefined>(undefined);
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveNow = useRef(live);
  liveNow.current = live;
  const flushPosition = useCallback(() => {
    if (positionTimer.current) clearTimeout(positionTimer.current);
    positionTimer.current = null;
    const position = pendingPosition.current;
    pendingPosition.current = null;
    if (!position) return;
    if (docId) dispatch({ type: 'library/SET_LAST_POSITION', id: docId, position });
    else if (externalKey) void saveExternalPosition(externalKey, position);
  }, [docId, externalKey, dispatch]);
  const savePosition = useCallback(
    (position: ReaderPosition) => {
      if (!liveNow.current) return;
      latestPosition.current = position;
      pendingPosition.current = position;
      if (positionTimer.current) clearTimeout(positionTimer.current);
      positionTimer.current = setTimeout(flushPosition, LAST_PAGE_SAVE_MS);
    },
    [flushPosition]
  );
  useEffect(() => {
    if (!live) return;
    return flushPosition;
  }, [live, flushPosition]);
  // Where reading is now, as last heard (Add to library carries it over).
  const currentPosition = useCallback(() => latestPosition.current ?? opened?.position, [opened]);

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

  // §7 R4, §18 W18: the page surface's session says when a password is missing or wrong
  // (readerPosition.classifyNativePdfError); any other failure is a file no password will open.
  const handlePdfError = useCallback(
    (code: NativePdfErrorCode) => {
      if (classifyNativePdfError(code) === 'damaged') {
        setNeedsPassword(false);
        setLoadProblem('damaged');
        return;
      }
      setLoadProblem(password !== undefined ? 'wrongPassword' : 'password');
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
    format,
    isPageRaster,
    pdfUri,
    nativeUri,
    title,
    pdfId,
    contentKey,
    fileMissing,
    pageCount,
    activeIndex,
    password,
    passwordDraft,
    setPasswordDraft,
    needsPassword,
    loadProblem,
    reloadKey,
    initialPage,
    // §18 W19: where a viewer mounting for the first time opens (a reload names its own page).
    positionReady: opened !== null,
    initialSpot: reloaded ? undefined : spot,
    initialViewerPosition: viewerPositionFor(format, opened?.position),
    savePosition,
    currentPosition,
    reload,
    handleLoad,
    handlePageChanged,
    handlePdfError,
    submitPassword,
  };
}
