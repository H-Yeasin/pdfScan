import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpenCoverOptions } from '../library/useCoverTarget';
import { Hint } from '../shared/Hint';
import { useHint } from '../shared/useHint';
import { useT } from '../../i18n/useT';
import { useBasePending } from '../../services/annotations/cleanBases';
import { flashRects, type NoteEntry } from '../../services/annotations/notesPanel';
import { useRouter } from '../../navigation/router';
import { useScreenRole } from '../../navigation/screenRole';
import { useBackHandler } from '../../navigation/useBackHandler';
import { canFindInDoc, canSign, isPageRasterFormat, isPdfLevel } from '../../services/documents/formatCapabilities';
import { libraryIdxFor, pdfPageCount, pdfPageFor } from '../../services/documents/pageMap';
import { pageLabel, pagePosition, pdfPageAfterEdit } from '../../services/documents/readerPosition';
import { readerMoreItems, readerProTasks, readerTools, type ReaderSubject, type ReaderToolId } from '../../services/documents/readerTools';
import { useIsPro } from '../../services/pro/entitlement';
import type { OutlineEntry } from '../../services/reader/outline';
import { chromeLocked, readerBackTarget } from '../../services/reader/readerSheets';
import type { ContentInsets } from '../../services/reader/surfaceGeometry';
import { submittedSummary } from '../../services/submit/history';
import { pruneSignatureFiles } from '../../services/signature/signatureRows';
import { useAppDispatch, useAppSlices, useAppStore } from '../../store/AppStateContext';
import { useSubmitDocument } from '../../store/useSubmitDocument';
import { spacing, useTheme } from '../../theme';
import type { Annotation, LibraryDocument } from '../../types/models';
import { formatShortDate } from '../../utils/format';
import { createId } from '../../utils/id';
import { DocxView } from './DocxView';
import { ReaderLoadProblem, ReaderNotice, ReaderNoticeAction } from './ReaderLoadProblem';
import { ReaderSheets } from './ReaderSheets';
import { ReaderToolBar, toolBarHeight } from './ReaderToolBar';
import { ReaderTopChrome, ROW_HEIGHT as TOP_BAR_ROW_HEIGHT } from './ReaderTopChrome';
import { SheetView } from './SheetView';
import { PageSurface, type PageSurfaceHandle } from './surface/PageSurface';
import type { SurfaceFindStatus } from './surface/useSurfaceFind';
import { TxtView } from './TxtView';
import { useConvertToPdf } from './useConvertToPdf';
import { useConvertToWord } from './useConvertToWord';
import { useEditFile } from './useEditFile';
import { useEditPages } from './useEditPages';
import { useFillForm } from './useFillForm';
import { usePageOcr } from './usePageOcr';
import { useReaderChrome } from './useReaderChrome';
import { useReaderDocument, type ReaderOpenSubject } from './useReaderDocument';
import { useReaderFind } from './useReaderFind';
import { useReaderOrientation } from './useReaderOrientation';
import { useReaderOverflowActions } from './useReaderOverflowActions';
import { useReaderSheets } from './useReaderSheets';
import { useReaderSigning } from './useReaderSigning';
import { useViewerFind } from './viewers/useViewerFind';

// §12 D2: the Reader on one file, laid out for studying. Top: Back, title, page "12 / 40", Find,
// Bookmark, More. Bottom: the study tool bar (readerTools). Tap the page to hide both bars.
// §18 W6: ReaderScreen mounts one of these per file (its `key`), so everything here starts fresh
// for another document and nothing needs resetting. The viewer's state lives in
// useReaderDocument, Find in useReaderFind, the bars in useReaderChrome, what is open over the
// page in useReaderSheets, the More items in useReaderOverflowActions, Sign in useReaderSigning;
// this component wires them to the viewers and the bars.
// §18 W17/W18: PDFs and scans are read on the page surface (surface/PageSurface), which is also
// where Find, Select text, Mark and Sign happen; the other formats have their own views.
export function ReaderDocumentView({ doc: openDoc, external }: ReaderOpenSubject) {
  const { tokens } = useTheme();
  const { t } = useT();
  // Back returns to wherever the document was opened from: Home, Library or a course page.
  const { back: pop } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'reader', 'settings');
  const reading = state.settings.reading;
  const isPro = useIsPro();
  const insets = useSafeAreaInsets();
  // The library document on screen; a file from outside has none.
  const doc = external ? undefined : openDoc;

  // §18 W10: the page surface counts library pages from 0; the rest of the Reader (the saved
  // position, "Go to page") counts PDF pages from 1. The two differ on a scan with a cover or
  // 2-in-1 sheets (documents/pageMap): everything here converts at this edge.
  const surfaceRef = useRef<PageSurfaceHandle>(null);
  // A scan's surface pages are its library pages; an imported PDF's and an outside file's are
  // the PDF's own.
  const mapped = !!doc && !isPdfLevel(doc);
  const mappedDoc = useRef(doc);
  mappedDoc.current = mapped ? doc : undefined;
  const goToPage = useCallback((page: number) => {
    surfaceRef.current?.goToIndex(mappedDoc.current ? libraryIdxFor(mappedDoc.current, page) : page - 1);
  }, []);
  // A library page, exactly: on a 2-in-1 sheet the PDF page alone can't say left or right.
  const goToIdx = useCallback((idx: number) => surfaceRef.current?.goToIndex(idx), []);
  // The library page the surface is on (it shows a 2-in-1 document as single pages).
  const [surfaceIdx, setSurfaceIdx] = useState<number | null>(null);
  // §18 W11: the PDF's contents, as the surface read them, and a page's text for a screen reader.
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const pageText = useCallback((idx: number) => surfaceRef.current?.pageText(idx) ?? Promise.resolve(''), []);
  const {
    format,
    isPageRaster,
    pdfUri,
    nativeUri,
    title,
    pdfId,
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
    positionReady,
    initialSpot,
    initialViewerPosition,
    savePosition,
    currentPosition,
    reload,
    handleLoad,
    handlePageChanged,
    handlePdfError,
    submitPassword,
  } = useReaderDocument({ doc: openDoc, external });
  usePageOcr(doc);
  // The page surface shows this file (a PDF or a scan); else the format's own view does.
  const onSurface = isPageRaster;
  // The format's own view shows it (TXT, a sheet, DOCX), through the viewer contract (viewers/types).
  const onViewer = format === 'TXT' || format === 'CSV' || format === 'XLSX' || format === 'XLS' || format === 'DOCX';
  // §18 W12: the page surface searches the query itself (PageSurface's useSurfaceFind) and says
  // what it found. §18 W19: so does each of the other viewers, with a current match to step from.
  const find = useReaderFind();
  const [surfaceFind, setSurfaceFind] = useState<SurfaceFindStatus | null>(null);
  const viewerFind = useViewerFind(find.query, find.open && onViewer);
  const findCount = useMemo(
    () => (onSurface ? { current: surfaceFind?.current ?? 0, total: surfaceFind?.total ?? 0, scanning: surfaceFind?.scanning ?? false } : viewerFind.count),
    [onSurface, surfaceFind, viewerFind.count]
  );
  const stepViewer = viewerFind.step;
  const findStep = useCallback((by: 1 | -1) => (onSurface ? surfaceRef.current?.findStep(by) : stepViewer(by)), [onSurface, stepViewer]);
  const subject = useMemo<ReaderSubject | null>(() => (doc ? { doc } : external ? { external } : null), [doc, external]);
  const proTasks = useMemo(() => (subject ? readerProTasks(subject) : []), [subject]);
  // §12 D7–D9: edit a TXT, CSV, XLSX, XLS or Word file (one ad unlocks the document for a while). Preloading is
  // shared with the conversion gate's (rewarded.preloadRewarded keeps one ad).
  const edit = useEditFile({ preload: proTasks.includes('editFiles') });
  const editorOpen = edit.open;
  const sheets = useReaderSheets();
  const { open: openSheet, openTool, closeTool, tool } = sheets;
  // §9 O1: Android back closes the find bar before leaving the Reader, once no sheet or tool is
  // open over it.
  useBackHandler(find.close, readerBackTarget(sheets.state, find.open) === 'find');
  // §16 G2: a Reader kept under a detour (Pro, a cover's options) doesn't hold the screen on.
  const onScreen = useScreenRole() === 'active';
  // §18 W10: the bars stay while Find, a sheet or a tool needs them.
  const chrome = useReaderChrome(reading.keepAwake && onScreen, find.open || chromeLocked(sheets.state));
  // §18 W11 (A13): the surface may be read sideways. Mark and Sign turn the screen upright (their
  // bars want its width). §18 W13: Select text is on the surface itself, and since W15 / W16 so
  // are Mark and placing a signature: modes of the same pages, not views over them.
  const surfaceSelecting = onSurface && tool?.kind === 'selectText';
  const surfaceMarking = onSurface && tool?.kind === 'mark';
  const surfaceSigning = onSurface && tool?.kind === 'signPlace';
  // §18 W19: the other viewers too (each lays itself out again for the new width); the file
  // editor over them is for an upright phone.
  const turnable = onSurface ? !tool || surfaceSelecting : onViewer && !editorOpen;
  const leave = useReaderOrientation(turnable && onScreen);
  // The surface's tools are not Modals: Back leaves them (a sheet over one goes first).
  const backIsTools = readerBackTarget(sheets.state, find.open) === 'tool';
  useBackHandler(closeTool, (surfaceSelecting || surfaceMarking) && backIsTools);
  const back = useCallback(() => leave(pop), [leave, pop]);
  const { toggle: toggleChrome, show: showChrome } = chrome;
  // §18 W2: a tap on the page hides the bars, but not while Find is open: its field is in the top
  // bar, and the tap is usually aimed at a match. A search result can open Find on a Reader kept
  // mounted with its bars hidden, so opening it shows them.
  const findOpen = find.open;
  const onViewerTap = useCallback(() => {
    if (!findOpen) toggleChrome();
  }, [findOpen, toggleChrome]);
  useEffect(() => {
    if (findOpen) showChrome();
  }, [findOpen, showChrome]);

  const submit = useSubmitDocument();
  const docSubmissions = useMemo(
    () => (doc ? state.library.submissions.filter((s) => s.documentId === doc.id) : []),
    [doc, state.library.submissions]
  );
  const night = reading.night;
  const tools = useMemo(() => (subject ? readerTools(subject, { proTasks, isPro }) : []), [subject, proTasks, isPro]);
  const moreItems = useMemo(() => (subject ? readerMoreItems(subject, { proTasks }) : []), [subject, proTasks]);
  // §12 D5/D6: Office → PDF and scan/PDF → Word, each through D1's gate; an ad is loaded ahead
  // while a file one of them applies to is open (only by that one: a file has one of the two).
  const toWord = !!format && isPageRasterFormat(format);
  const convert = useConvertToPdf({ preload: proTasks.includes('convert') && !toWord });
  const word = useConvertToWord({ preload: proTasks.includes('convert') && toWord });
  const { start: startConvert } = convert;
  const { start: startWord } = word;
  const convertSource = useMemo(() => {
    if (external) return { uri: external.uri, name: external.name, format: external.format, docId: external.uri };
    if (doc?.contentUri) return { uri: doc.contentUri, name: doc.name, format: doc.format, docId: doc.id };
    return null;
  }, [doc, external]);
  const convertToPdf = useCallback(() => {
    if (convertSource) startConvert(convertSource);
  }, [convertSource, startConvert]);
  const convertToWord = useCallback(() => {
    if (external) startWord({ uri: external.uri, name: external.name, title: external.name, grantId: external.uri });
    else if (doc) startWord({ docId: doc.id, title: doc.name, grantId: doc.id });
  }, [doc, external, startWord]);
  const { start: startEdit } = edit;
  const editFile = useCallback(() => {
    if (external) startEdit({ external });
    else if (doc) startEdit({ doc });
  }, [doc, external, startEdit]);
  // §12 D10: fill in a PDF's form, and Mark mode's Text tool; both `pdfForms` (one ad unlocks the
  // document for a while).
  const form = useFillForm({ preload: proTasks.includes('pdfForms') });
  const { start: startForm, unlockText, isTextUnlocked } = form;
  const fillForm = useCallback(() => {
    if (external) void startForm({ external });
    else if (doc) void startForm({ doc });
  }, [doc, external, startForm]);

  // §7 R3: the page editor; a saved edit rewrites document.pdf, so the surface is mounted again
  // for it, §18 W5: on the page that was being read, wherever the edit moved it.
  const onPagesEdited = useCallback(
    (before: LibraryDocument, after: LibraryDocument) => reload((page) => pdfPageAfterEdit(before, after, page)),
    [reload]
  );
  const editPages = useEditPages(doc, onPagesEdited);
  // §14 Q7: Academic options for this document; Back (or Apply) returns here.
  const openCoverOptions = useOpenCoverOptions();

  // §12 D10: whether Mark mode's Text tool is open on this document (checked without asking when
  // Mark mode opens, so a remembered Text tool comes back; else unlocked through the gate).
  const [textUnlocked, setTextUnlocked] = useState(false);
  const markOpen = tool?.kind === 'mark';
  useEffect(() => {
    if (!markOpen || !doc) {
      setTextUnlocked(false);
      return;
    }
    let cancelled = false;
    isTextUnlocked(doc)
      .then((on) => {
        if (!cancelled && on) setTextUnlocked(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [markOpen, doc, isTextUnlocked]);
  // The library page on screen (on a 2-up sheet, its left page).
  const sheetIdx = doc ? libraryIdxFor(doc, activeIndex + 1) : 0;
  const currentIdx = onSurface && mapped && surfaceIdx !== null ? Math.min(surfaceIdx, Math.max(0, doc.pages.length - 1)) : sheetIdx;
  // §18 W5: the top bar and "Go to page" count library pages, like the page strip. §18 W10: the
  // surface shows one library page at a time, also where the PDF has two on a sheet.
  const shownPage = useMemo(() => {
    const label = pageLabel(doc, activeIndex + 1, pageCount);
    return onSurface && mapped && label.library ? { ...label, first: currentIdx + 1, last: currentIdx + 1 } : label;
  }, [doc, activeIndex, pageCount, onSurface, mapped, currentIdx]);
  // §12 D10: Mark mode's Text tool and its gate, for whichever Mark mode is open.
  const markText = useMemo(
    () => (doc ? { unlocked: isPro || textUnlocked, pro: !isPro, onUnlock: () => unlockText(doc, () => setTextUnlocked(true)) } : undefined),
    [doc, isPro, textUnlocked, unlockText]
  );
  // §12 D4: a mark picked in the Notes panel flashes on its page. §18 W12: the surface draws the
  // mark's own geometry.
  const annotations = state.library.annotations;
  const docId = doc?.id;
  const docMarks = useMemo(() => (docId ? annotations.filter((a) => a.documentId === docId) : NO_MARKS), [annotations, docId]);
  // §18 W17: until an older build's marks are out of an imported PDF's file (cleanBases), its
  // pages are drawn without the file's annotations, or those marks would show under their rows.
  // Once the file is clean the surface is mounted again for it, on the page being read.
  const plainPages = useBasePending(docId) && !mapped;
  const wasPlain = useRef(plainPages);
  useEffect(() => {
    if (wasPlain.current && !plainPages) reload();
    wasPlain.current = plainPages;
  }, [plainPages, reload]);
  // §18 W16: Sign. The page is the one being read, and the signature is a row.
  const signing = useReaderSigning({ doc: doc && canSign(doc) ? doc : undefined, idx: currentIdx, sheets });
  useBackHandler(signing.onCancel, surfaceSigning && backIsTools);
  // A signature that was erased keeps its PNG while the erasing can be undone: tidied when the
  // Reader lets go of the document.
  const store = useAppStore();
  useEffect(() => {
    if (!onSurface || !docId) return;
    return () => pruneSignatureFiles(docId, store.getState().library.annotations);
  }, [onSurface, docId, store]);
  const flashNote = useCallback(
    (entry: NoteEntry) => {
      const mark = annotations.find((a) => a.id === entry.id);
      if (mark) surfaceRef.current?.flash(entry.pageIdx, flashRects(mark));
    },
    [annotations]
  );
  // §5 T5: the bookmark on the page on screen.
  const currentBookmark = doc ? state.library.bookmarks.find((b) => b.documentId === doc.id && b.pageId === doc.pages[currentIdx]?.id) : undefined;
  // §9 O3: one-time hint. It waits until nothing covers the top bar.
  const canBookmark = !!doc && isPageRaster;
  const covered = chromeLocked(sheets.state) || needsPassword;
  const bookmarkHint = useHint('readerBookmark', canBookmark && chrome.shown && !find.open && !covered);
  const addBookmark = (label?: string) => {
    if (!doc?.pages[currentIdx]) return;
    dispatch({
      type: 'library/ADD_BOOKMARK',
      bookmark: { id: createId('bookmark'), documentId: doc.id, pageId: doc.pages[currentIdx].id, label: label?.trim() || undefined, createdAt: Date.now() },
    });
  };

  // A page search result: once the pages are known, jump to that library page and find the query
  // from there. (The viewer already opened on it, useReaderDocument's first page; the jump is for
  // a Reader that was open.) §18 W5: only the Reader on screen takes the target. §18 W12: Find
  // starts from that library page (a 2-in-1 sheet's PDF page can't name it) and searches on
  // through the document.
  const target = onScreen ? state.reader.target : null;
  const { openOnPage } = find;
  useEffect(() => {
    if (!target || !doc || pageCount === 0) return;
    dispatch({ type: 'reader/SET_TARGET', target: null });
    const idx = doc.pages.findIndex((p) => p.id === target.pageId);
    if (idx < 0) return;
    openOnPage(idx, target.query);
    goToIdx(idx);
  }, [target, doc, pageCount, dispatch, openOnPage, goToIdx]);

  // §18 W10: the surface's pages → the PDF pages useReaderDocument counts and saves (`lastPage`).
  const surfaceCount = useRef(0);
  const onSurfaceLoad = useCallback(
    (count: number) => {
      surfaceCount.current = mappedDoc.current ? pdfPageCount(mappedDoc.current) : count;
      handleLoad(surfaceCount.current);
    },
    [handleLoad]
  );
  const onSurfacePage = useCallback(
    (idx: number) => {
      setSurfaceIdx(idx);
      if (surfaceCount.current > 0) handlePageChanged(mappedDoc.current ? pdfPageFor(mappedDoc.current, idx).page : idx + 1, surfaceCount.current);
    },
    [handlePageChanged]
  );
  // What covers the surface's edges with the bars shown: their measured heights (an estimate
  // until the first layout) and the safe area. A file with no tools has no bottom bar.
  const topInset = chrome.bars.top || insets.top + TOP_BAR_ROW_HEIGHT;
  const bottomInset = tools.length > 0 ? chrome.bars.bottom || toolBarHeight(insets.bottom) : insets.bottom;
  const surfaceInsets = useMemo<ContentInsets>(
    () => ({ top: topInset, bottom: bottomInset, left: insets.left, right: insets.right }),
    [topInset, bottomInset, insets.left, insets.right]
  );

  // §18 W19: the surface's position, by the page's id where it has one.
  const positionDoc = useRef(doc);
  positionDoc.current = doc;
  const onSurfacePosition = useCallback((idx: number, fy: number) => savePosition(pagePosition(positionDoc.current, idx, fy)), [savePosition]);
  // §18 W19 (A15): what every other viewer gets (viewers/types).
  const viewerProps = {
    night,
    insets: surfaceInsets,
    onTap: onViewerTap,
    find: viewerFind.find,
    onFindResult: viewerFind.onFindResult,
    initialPosition: initialViewerPosition,
    onPosition: savePosition,
    onScrollDirection: chrome.directed,
  };

  const handleTool = useCallback(
    (id: ReaderToolId) => {
      // A file's Pro tasks: one conversion (Office → PDF, D5, or scan/PDF → Word, D6), editing a
      // TXT, CSV, XLSX, XLS or Word file (D7–D9), filling in a PDF's form (D10). With more than
      // one, a picker (two at most per format); with one, it runs straight away.
      if (id === 'convertEdit') {
        const choices: { text: string; onPress: () => void }[] = [];
        if (proTasks.includes('convert')) {
          choices.push({ text: t(toWord ? 'reader.actions.convertToWord' : 'reader.actions.convertToPdf'), onPress: toWord ? convertToWord : convertToPdf });
        }
        if (proTasks.includes('editFiles')) choices.push({ text: t('reader.convertEdit.edit'), onPress: editFile });
        if (proTasks.includes('pdfForms')) choices.push({ text: t('reader.actions.fillForm'), onPress: fillForm });
        if (choices.length > 1) Alert.alert(t('reader.convertEdit.title'), undefined, [{ text: t('common.cancel'), style: 'cancel' }, ...choices]);
        else choices[0]?.onPress();
        return;
      }
      if (!doc) return;
      // §18 W13: on the surface the Select tool is a mode of the page, and its button also leaves it.
      if (id === 'selectText' && surfaceSelecting) closeTool();
      else if (id === 'mark' || id === 'selectText') openTool({ kind: id, idx: currentIdx });
      else openSheet({ kind: id });
    },
    [doc, currentIdx, proTasks, toWord, convertToPdf, convertToWord, editFile, fillForm, openTool, closeTool, surfaceSelecting, openSheet, t]
  );

  const onSelectMore = useReaderOverflowActions({
    doc,
    external,
    pdfUri,
    annotations: docMarks,
    title,
    isPageRaster,
    pageCount,
    pdfPage: activeIndex + 1,
    position: currentPosition,
    dispatch,
    t,
    back,
    openSheet,
    submit,
    sign: signing.start,
    editPages: editPages.open,
    openCoverOptions,
    convertToPdf,
    convertToWord,
    editFile,
    fillForm,
  });

  if (fileMissing) {
    return (
      <ReaderNotice title={t('reader.filesMissing')} body={t('reader.filesMissingBody')} centered>
        <ReaderNoticeAction label={t('common.back')} onPress={back} />
      </ReaderNotice>
    );
  }

  if (doc && !isPageRaster && !nativeUri) return <ReaderNotice body={t('reader.loading')} />;

  const surfaceTooled = surfaceMarking || surfaceSigning;

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {!positionReady ? null : onSurface ? (
        <PageSurface
          // Mounted again for each reload (useReaderDocument): a rewritten file, a password to try.
          key={`${pdfUri ?? pdfId}:${reloadKey}`}
          ref={surfaceRef}
          subject={subject!}
          pdfUri={pdfUri}
          plainPages={plainPages}
          owner={pdfId}
          password={password}
          reading={reading}
          insets={surfaceInsets}
          safeBottom={insets.bottom}
          chrome={chrome.progress}
          onScroll={chrome.scrolled}
          // §18 W19: the saved place on the page it was left on; else the page a reload, a search
          // hit or the old saved page number names.
          initialIndex={initialSpot ? initialSpot.index : mapped ? libraryIdxFor(doc, initialPage ?? 1) : (initialPage ?? 1) - 1}
          initialFy={initialSpot?.fy}
          onPosition={onSurfacePosition}
          onLoad={onSurfaceLoad}
          onPage={onSurfacePage}
          onTap={onViewerTap}
          onOutline={setOutline}
          onReadText={(idx) => openSheet({ kind: 'pageText', idx })}
          findQuery={find.open ? find.query : ''}
          findFrom={find.targetPage}
          onFindStatus={setSurfaceFind}
          selecting={surfaceSelecting}
          onSelectDone={closeTool}
          marks={docMarks}
          marking={surfaceMarking}
          markText={markText}
          onMarkDone={closeTool}
          signing={signing.request}
          onSignPlaced={signing.onPlaced}
          onSignCancel={signing.onCancel}
          onSignRedraw={signing.onRedraw}
          onError={handlePdfError}
        />
      ) : format === 'CSV' || format === 'XLSX' || format === 'XLS' ? (
        <SheetView key={nativeUri} uri={nativeUri!} format={format} chrome={chrome.progress} {...viewerProps} />
      ) : format === 'TXT' ? (
        <TxtView key={nativeUri} uri={nativeUri!} {...viewerProps} />
      ) : format === 'DOCX' ? (
        <DocxView key={nativeUri} uri={nativeUri!} {...viewerProps} />
      ) : format === 'DOC' ? (
        // Only on documents added before R5 dropped .doc; there's no viewer for it.
        <View style={styles.unsupported}>
          <Text style={[styles.unsupportedText, { color: tokens.muted }]}>{t('reader.docUnsupported')}</Text>
        </View>
      ) : null}

      <ReaderLoadProblem
        loadProblem={loadProblem}
        needsPassword={needsPassword}
        passwordDraft={passwordDraft}
        onChangePassword={setPasswordDraft}
        onSubmitPassword={submitPassword}
        onBack={back}
      />

      {/* §18 W15/W16: Mark and Sign on the surface bring their own bars, in the same places. */}
      {surfaceTooled ? null : (
        <ReaderTopChrome
          visible={chrome.progress}
          onHeight={chrome.onTopHeight}
          name={title}
          onBack={() => back()}
          onOverflow={() => openSheet({ kind: 'more' })}
          page={shownPage}
          onJump={isPageRaster ? () => openSheet({ kind: 'jump' }) : undefined}
          onFind={format && canFindInDoc(format) ? find.toggle : undefined}
          findOpen={find.open}
          findQuery={find.query}
          onChangeFindQuery={find.changeQuery}
          findCount={findCount}
          onFindStep={findStep}
          subtitle={submittedSummary(docSubmissions, formatShortDate)}
          onSubtitlePress={() => openSheet({ kind: 'submissions' })}
          bookmarked={canBookmark ? !!currentBookmark : undefined}
          onBookmark={() => {
            if (currentBookmark) dispatch({ type: 'library/REMOVE_BOOKMARK', id: currentBookmark.id });
            else addBookmark();
          }}
          onBookmarkLongPress={() => openSheet({ kind: 'label' })}
        />
      )}

      {bookmarkHint.visible && !surfaceTooled ? (
        <Hint
          text={t('shared.hint.readerBookmark')}
          onDismiss={bookmarkHint.dismiss}
          arrow="up"
          arrowAlign="right"
          // Under the top bar's bookmark button (44 pt bar; the overflow button is to its right).
          style={[styles.bookmarkHint, { top: insets.top + 44 + spacing.sm }]}
        />
      ) : null}

      {surfaceTooled ? null : <ReaderToolBar visible={chrome.progress} onHeight={chrome.onBottomHeight} tools={tools} onPress={handleTool} />}

      <ReaderSheets
        sheets={sheets}
        doc={doc}
        isPageRaster={isPageRaster}
        currentIdx={currentIdx}
        shownPage={shownPage}
        goToPage={goToPage}
        goToIdx={goToIdx}
        outline={onSurface ? outline : NO_OUTLINE}
        pageText={pageText}
        flashNote={flashNote}
        moreItems={moreItems}
        onSelectMore={onSelectMore}
        submissions={docSubmissions}
        currentBookmark={currentBookmark}
        addBookmark={addBookmark}
      />

      {editPages.overlays}

      {convert.element}
      {word.element}
      {edit.element}
      {form.element}

      {signing.overlays}
    </View>
  );
}

const NO_OUTLINE: OutlineEntry[] = [];
const NO_MARKS: Annotation[] = [];

const styles = StyleSheet.create({
  // The top bar's buttons are 44 pt with a 6 pt gap and an 8 pt edge; the bookmark button is the
  // second from the right. The Hint's right-aligned arrow is centred 24 pt from its edge.
  bookmarkHint: {
    position: 'absolute',
    right: spacing.sm + 44 + 6 + 22 - 24,
  },
  unsupported: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  unsupportedText: { textAlign: 'center' },
  container: {
    flex: 1,
  },
});
