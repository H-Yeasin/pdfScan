import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DocTypePickerModal } from '../components/courses/DocTypeChips';
import { OverflowSheet, type OverflowItemId } from '../components/reader/OverflowSheet';
import { docTypeOf, getDocType } from '../services/courses/docTypes';
import { PdfPageView, type PdfPageViewHandle } from '../components/reader/PdfPageView';
import { ReaderToolBar } from '../components/reader/ReaderToolBar';
import { ReaderTopChrome, ROW_HEIGHT as TOP_BAR_ROW_HEIGHT } from '../components/reader/ReaderTopChrome';
import { ReadingSettingsSheet } from '../components/reader/ReadingSettingsSheet';
import { useReaderChrome } from '../components/reader/useReaderChrome';
import { useReaderDocument } from '../components/reader/useReaderDocument';
import { usePageOcr } from '../components/reader/usePageOcr';
import { useReaderFind } from '../components/reader/useReaderFind';
import { SheetView } from '../components/reader/SheetView';
import { TxtView } from '../components/reader/TxtView';
import { DocxView } from '../components/reader/DocxView';
import { useConvertToPdf } from '../components/reader/useConvertToPdf';
import { useConvertToWord } from '../components/reader/useConvertToWord';
import { useEditFile } from '../components/reader/useEditFile';
import { useFillForm } from '../components/reader/useFillForm';
import { usePageImage } from '../components/shared/usePageImage';
import { useEditPages } from '../components/reader/useEditPages';
import { useOpenCoverOptions } from '../components/library/useCoverTarget';
import { PageScrubberSheet } from '../components/reader/PageScrubberSheet';
import { pageLabel, parseJumpInput, pdfPageAfterEdit } from '../services/documents/readerPosition';
import { SignatureCaptureModal } from '../components/shared/SignatureCaptureModal';
import { SignatureModal } from '../components/shared/SignatureModal';
import { SignaturePlacementOverlay } from '../components/shared/SignaturePlacementOverlay';
import { useRouter } from '../navigation/router';
import { useScreenRole } from '../navigation/screenRole';
import { cleanTemporaryCache, deleteDocumentFiles } from '../services/persistence/libraryFiles';
import {
  applySignedPage,
  applySignatureToDocument,
  promoteExternalToLibrary,
} from '../services/persistence/libraryOperations';
import { printDocument, printFileUri, shareAs, shareDocument, shareFileName, shareFileUri } from '../services/sharing/shareService';
import { saveSignatureForReuse } from '../services/signature/savedSignatureStorage';
import { signTargets, type SignaturePlacement } from '../services/signature/signaturePlacement';
import { canFindInDoc, canSign, isPageRasterFormat } from '../services/documents/formatCapabilities';
import { readerMoreItems, readerProTasks, readerTools, type ReaderSubject, type ReaderToolId } from '../services/documents/readerTools';
import { NIGHT_OVERLAY_ALPHA, pdfViewOptions, type ReadingSettings } from '../services/documents/readingSettings';
import { useIsPro } from '../services/pro/entitlement';
import { useShareSubmission, useSubmitDocument } from '../store/useSubmitDocument';
import { SubmissionsSheet } from '../components/submit/SubmissionsSheet';
import { submittedSummary } from '../services/submit/history';
import { formatShortDate } from '../utils/format';
import { libraryIdxFor, pdfPageFor } from '../services/documents/pageMap';
import * as Clipboard from 'expo-clipboard';
import { SelectTextSheet } from '../components/reader/SelectTextSheet';
import { MarkView } from '../components/reader/MarkView';
import { useAnnotationPdfSync } from '../components/reader/useAnnotationPdfSync';
import { BookmarksSheet } from '../components/bookmarks/BookmarkList';
import { NotesSheet } from '../components/reader/NotesSheet';
import { useMarkFlash } from '../components/reader/useMarkFlash';
import { documentNotes, flashQuery, formatNotesExport, notesExportLabels, type NoteEntry } from '../services/annotations/notesPanel';
import { tDoc } from '../i18n';
import { documentBookmarks } from '../services/study/bookmarks';
import { TextPromptModal } from '../components/shared/TextPromptModal';
import { createId } from '../utils/id';
import { writeDocumentText, writeExportText } from '../services/study/textExport';
import { extractDocumentText } from '../services/study/textSelection';
import { MIME_BY_FORMAT } from '../utils/docFormat';
import { useAppDispatch, useAppSlices } from '../store/AppStateContext';
import type { LibraryDocument } from '../types/models';
import { spacing, useTheme } from '../theme';
import { useT } from '../i18n/useT';
import { Hint } from '../components/shared/Hint';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHint } from '../components/shared/useHint';

// §12 D2: the Reader, laid out for studying. Top: Back, title, page "12 / 40", Find, Bookmark,
// More. Bottom: the study tool bar (readerTools). Tap the page to hide both bars. The document
// and its viewer state live in useReaderDocument, Find in useReaderFind, the bars in
// useReaderChrome; this screen wires them to the sheets.
export function ReaderScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  // Back returns to wherever the document was opened from: Home, Library or a course page.
  const { go, back } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'reader', 'signature', 'settings');
  const reading = state.settings.reading;
  const isPro = useIsPro();

  const pdfRef = useRef<PdfPageViewHandle>(null);
  const goToPage = useCallback((page: number) => pdfRef.current?.goToPage(page), []);
  const {
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
  } = useReaderDocument();
  usePageOcr(doc);
  const find = useReaderFind({ pdfUri, pdfId, pageCount, contentKey, goToPage });
  // §16 G2: a Reader kept under a detour (Pro, a cover's options) doesn't hold the screen on.
  const onScreen = useScreenRole() === 'active';
  const chrome = useReaderChrome(reading.keepAwake && onScreen);
  const { reset: resetChrome, onPage: onChromePage, toggle: toggleChrome, show: showChrome } = chrome;
  useEffect(() => resetChrome(), [contentKey, resetChrome]);
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
  const shareSubmission = useShareSubmission();
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const docSubmissions = useMemo(
    () => (doc ? state.library.submissions.filter((s) => s.documentId === doc.id) : []),
    [doc, state.library.submissions]
  );
  const night = reading.night;
  const signVisible = !external && !!doc && canSign(doc);
  const subject = useMemo<ReaderSubject | null>(() => (doc && !external ? { doc } : external ? { external } : null), [doc, external]);
  const proTasks = useMemo(() => (subject ? readerProTasks(subject) : []), [subject]);
  const tools = useMemo(() => (subject ? readerTools(subject, { proTasks, isPro }) : []), [subject, proTasks, isPro]);
  const moreItems = useMemo(() => (subject ? readerMoreItems(subject, { proTasks }) : []), [subject, proTasks]);
  // §12 D5/D6: Office → PDF and scan/PDF → Word, each through D1's gate; an ad is loaded ahead
  // while a file one of them applies to is open (only by that one: a file has one of the two).
  const subjectFormat = external ? external.format : doc?.format;
  const toWord = !!subjectFormat && isPageRasterFormat(subjectFormat);
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
  // §12 D7–D9: edit a TXT, CSV, XLSX, XLS or Word file (one ad unlocks the document for a while). Preloading is
  // shared with the conversion gate's (rewarded.preloadRewarded keeps one ad).
  const edit = useEditFile({ preload: proTasks.includes('editFiles') });
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

  const [overflowOpen, setOverflowOpen] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [scrubberOpen, setScrubberOpen] = useState(false);
  // §7 R3: the page editor; a saved edit rewrites document.pdf, so the viewer reloads it, §18 W5:
  // on the page that was being read, wherever the edit moved it.
  const onPagesEdited = useCallback(
    (before: LibraryDocument, after: LibraryDocument) => reload((page) => pdfPageAfterEdit(before, after, page)),
    [reload]
  );
  const editPages = useEditPages(doc && !external ? doc : undefined, onPagesEdited);
  // §14 Q7: Academic options for this document; Back (or Apply) returns here.
  const openCoverOptions = useOpenCoverOptions();
  const [signing, setSigning] = useState(false);
  const [signStep, setSignStep] = useState<'capture' | 'place' | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<{ uri: string; aspectRatio: number } | null>(null);
  // §18 W1: the library page being signed, set when signing starts. Everything in the flow uses it
  // (the page shown for placing, the page written, the snack), never the PDF page on screen: after
  // a cover or on a 2-in-1 sheet the two numbers differ.
  const [signIdx, setSignIdx] = useState(0);
  // §5 T3: the library page open in "Select text", or null.
  const [selectTextIdx, setSelectTextIdx] = useState<number | null>(null);
  // §12 D3: the library page Mark mode opened on, or null.
  const [markIdx, setMarkIdx] = useState<number | null>(null);
  // §12 D10: whether Mark mode's Text tool is open on this document (checked without asking when
  // Mark mode opens, so a remembered Text tool comes back; else unlocked through the gate).
  const [textUnlocked, setTextUnlocked] = useState(false);
  const markOpen = markIdx !== null;
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
  // §12 D3: marks reach document.pdf in the background; the viewer then reloads on the page being
  // read.
  const syncAnnotations = useAnnotationPdfSync(useCallback(() => reload(), [reload]));
  // §5 T5: bookmarks of this document, and the one on the page on screen.
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [labelling, setLabelling] = useState(false);
  const docBookmarks = useMemo(() => (doc ? documentBookmarks(state.library.bookmarks, doc) : []), [doc, state.library.bookmarks]);
  const currentIdx = doc ? libraryIdxFor(doc, activeIndex + 1) : 0;
  // §18 W5: the top bar and "Go to page" count library pages, like the page strip.
  const shownPage = useMemo(() => pageLabel(doc && !external ? doc : undefined, activeIndex + 1, pageCount), [doc, external, activeIndex, pageCount]);
  // §12 D4: the notes panel: marks, notes and bookmarks by page.
  const [notesOpen, setNotesOpen] = useState(false);
  const docNotes = useMemo(
    () => (doc ? documentNotes(doc, state.library.annotations, state.library.bookmarks) : []),
    [doc, state.library.annotations, state.library.bookmarks]
  );
  const markFlash = useMarkFlash(pdfId, contentKey);
  const currentBookmark = doc ? state.library.bookmarks.find((b) => b.documentId === doc.id && b.pageId === doc.pages[currentIdx]?.id) : undefined;
  // §9 O3: one-time hints. The bookmark hint waits until nothing covers the top bar; the Submit
  // hint shows inside the overflow sheet, next to Submit, the first time it's there.
  const sheetOpen =
    overflowOpen || readingOpen || typePickerOpen || jumpOpen || scrubberOpen || submissionsOpen || bookmarksOpen || notesOpen || labelling ||
    signing || signStep !== null || selectTextIdx !== null || markIdx !== null || needsPassword;
  const canBookmark = !!doc && !external && isPageRaster;
  const bookmarkHint = useHint('readerBookmark', canBookmark && chrome.shown && !find.open && !sheetOpen);
  const showSubmit = moreItems.includes('submit');
  const insets = useSafeAreaInsets();
  const submitHint = useHint('submit', overflowOpen && showSubmit);
  const addBookmark = (label?: string) => {
    if (!doc?.pages[currentIdx]) return;
    dispatch({
      type: 'library/ADD_BOOKMARK',
      bookmark: { id: createId('bookmark'), documentId: doc.id, pageId: doc.pages[currentIdx].id, label: label?.trim() || undefined, createdAt: Date.now() },
    });
  };

  // A page search result: once the PDF has loaded, jump to that library page's PDF page and
  // highlight the query there. (The viewer already opened on it, useReaderDocument's first page;
  // the jump is for a Reader that was open.) §18 W5: only the Reader on screen takes the target.
  const target = onScreen ? state.reader.target : null;
  const { openOnPage } = find;
  useEffect(() => {
    if (!target || !doc || pageCount === 0) return;
    dispatch({ type: 'reader/SET_TARGET', target: null });
    const idx = doc.pages.findIndex((p) => p.id === target.pageId);
    if (idx < 0) return;
    const { page } = pdfPageFor(doc, idx);
    openOnPage(page, target.query);
    goToPage(page);
  }, [target, doc, pageCount, dispatch, openOnPage, goToPage]);

  const onPageChanged = useCallback(
    (page: number, count: number) => {
      handlePageChanged(page, count);
      onChromePage(page);
    },
    [handlePageChanged, onChromePage]
  );

  const setReading = useCallback(
    (patch: Partial<ReadingSettings>) => dispatch({ type: 'settings/SET_READING', reading: patch }),
    [dispatch]
  );

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
      // The library page on screen (on a 2-up sheet, its left page).
      const idx = libraryIdxFor(doc, activeIndex + 1);
      if (id === 'mark') setMarkIdx(idx);
      else if (id === 'selectText') setSelectTextIdx(idx);
      else if (id === 'notes') setNotesOpen(true);
      else if (id === 'pages') setScrubberOpen(true);
    },
    [doc, activeIndex, proTasks, toWord, convertToPdf, convertToWord, editFile, fillForm, t]
  );

  // Starts signing library page `idx`: a PDF-format document gets the signature drawn onto its
  // PDF page (capture, then place); a JPG one has it flattened into the page's master.
  const startSigning = useCallback(
    (idx: number) => {
      if (!doc) return;
      setSignIdx(idx);
      if (doc.format === 'PDF') {
        if (state.signature.saved) {
          setCapturedSignature(state.signature.saved);
          setSignStep('place');
        } else {
          setSignStep('capture');
        }
      } else {
        setSigning(true);
      }
    },
    [doc, state.signature.saved]
  );

  const handleOverflowSelect = useCallback(
    async (id: OverflowItemId) => {
      if (id === 'share') {
        if (external) await shareFileUri(external.uri, MIME_BY_FORMAT[external.format], external.name);
        else if (doc) await shareDocument(doc);
      } else if (id === 'print') {
        if (external) await printFileUri(external.uri);
        else if (doc) await printDocument(doc);
      } else if (id === 'export') {
        // A library PDF is shared under the document's name, not as `document.pdf` (see
        // shareAs); an external file already has its own name.
        if (external && pdfUri) await shareFileUri(pdfUri, 'application/pdf', title);
        else if (pdfUri) await shareAs(pdfUri, shareFileName(title, 'pdf'), 'application/pdf');
      } else if (id === 'convertToPdf') {
        convertToPdf();
      } else if (id === 'convertToWord') {
        convertToWord();
      } else if (id === 'editFile') {
        editFile();
      } else if (id === 'fillForm') {
        fillForm();
      } else if (id === 'sign') {
        if (!doc || !signVisible) return;
        // The library pages on the PDF page on screen. A 2-in-1 sheet shows two: ask which one.
        const targets = signTargets(doc, activeIndex + 1);
        if (targets.length > 1) {
          Alert.alert(t('reader.signWhichPage'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            ...targets.map((idx) => ({ text: t('reader.signPage', { page: idx + 1 }), onPress: () => startSigning(idx) })),
          ]);
        } else if (targets.length === 1) {
          startSigning(targets[0]);
        }
      } else if (id === 'addToLibrary') {
        if (!external) return;
        const promoted = await promoteExternalToLibrary(external);
        // §18 W5: the library copy opens on the page being read, not on page 1.
        if (isPageRaster && pageCount > 0) promoted.lastPage = activeIndex + 1;
        dispatch({ type: 'library/ADD_FILE', file: promoted });
        dispatch({ type: 'reader/SET_READER_ID', id: promoted.id });
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.addedToLibrary') });
      } else if (id === 'changeType') {
        if (doc) setTypePickerOpen(true);
      } else if (id === 'submit') {
        if (doc) await submit(doc);
      } else if (id === 'bookmarks') {
        setBookmarksOpen(true);
      } else if (id === 'editPages') {
        editPages.open();
      } else if (id === 'addCover' || id === 'changeCover') {
        if (doc) openCoverOptions(doc);
      } else if (id === 'readingSettings') {
        setReadingOpen(true);
      } else if (id === 'copyText' || id === 'extractText') {
        if (!doc) return;
        // The library page on screen (on a 2-up sheet, its left page).
        const idx = libraryIdxFor(doc, activeIndex + 1);
        if (id === 'copyText') {
          const text = doc.pages[idx]?.ocr?.text.trim() ?? '';
          if (!text) {
            dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.noPageText') });
            return;
          }
          await Clipboard.setStringAsync(text);
          dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.copiedPage', { page: idx + 1 }) });
        } else {
          Alert.alert(t('reader.extractTitle'), t('reader.extractBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('reader.copy'),
              onPress: async () => {
                await Clipboard.setStringAsync(extractDocumentText(doc));
                dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.copiedAll') });
              },
            },
            { text: t('reader.shareTxt'), onPress: () => shareAs(writeDocumentText(doc), shareFileName(doc.name, 'txt'), 'text/plain') },
          ]);
        }
      } else if (id === 'delete') {
        if (!doc) return;
        Alert.alert(
          t('reader.deleteTitle'),
          t('reader.deleteBody', { name: doc.name }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('reader.delete'),
              style: 'destructive',
              onPress: () => {
                dispatch({ type: 'library/REMOVE_FILES', ids: [doc.id] });
                deleteDocumentFiles(doc.id);
                back();
              },
            },
          ]
        );
      }
    },
    [doc, external, pdfUri, title, signVisible, dispatch, back, startSigning, submit, activeIndex, isPageRaster, pageCount, editPages, convertToPdf, convertToWord, editFile, fillForm, openCoverOptions, t]
  );

  const handleSignConfirm = useCallback(
    async (flattenedUri: string) => {
      if (!doc) return;
      const updated = await applySignedPage(
        doc,
        signIdx,
        flattenedUri,
        state.library.annotations.filter((a) => a.documentId === doc.id)
      );
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      setSigning(false);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.signedPage', { page: signIdx + 1 }) });
    },
    [doc, signIdx, dispatch, state.library.annotations, t]
  );

  const handleSignatureCaptured = useCallback(
    async (signature: { uri: string; aspectRatio: number }) => {
      const saved = await saveSignatureForReuse(signature.uri, signature.aspectRatio);
      // The drawing was a temporary file; the saved copy is the one placed, now and next time.
      cleanTemporaryCache([signature.uri]);
      dispatch({ type: 'signature/SET_SAVED', saved });
      setCapturedSignature(saved);
      setSignStep('place');
    },
    [dispatch]
  );

  const handleRedraw = useCallback(() => {
    setSignStep('capture');
  }, []);

  const handlePlacementCancel = useCallback(() => {
    setSignStep(null);
    setCapturedSignature(null);
  }, []);

  // The page the signature is placed on: its master, or for an imported PDF the page rendered now.
  const signPage = usePageImage(doc, signIdx, signStep === 'place');

  const handlePlacementConfirm = useCallback(
    async (placement: SignaturePlacement) => {
      if (!doc || !capturedSignature || !signPage) return;
      const updated = await applySignatureToDocument(doc, signIdx, capturedSignature.uri, placement, signPage);
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: updated });
      setSignStep(null);
      setCapturedSignature(null);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('shared.signature.added') });
    },
    [doc, signIdx, capturedSignature, signPage, dispatch, t]
  );

  // §18 W5: a Reader that has never been on screen has no document to show.
  if (inert) return <View style={[styles.container, { backgroundColor: tokens.bg }]} />;

  if (!doc && !external) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.notFound')}</Text>
      </View>
    );
  }

  if (fileMissing) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={[styles.passwordTitle, { color: tokens.ink }]}>{t('reader.filesMissing')}</Text>
        <Text style={{ color: tokens.muted, textAlign: 'center' }}>{t('reader.filesMissingBody')}</Text>
        <Pressable accessibilityRole="button" onPress={() => back()} hitSlop={8}>
          <Text style={{ color: tokens.accentInk, fontWeight: '600' }}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  if (doc && !external && isPageRaster && !pdfUri && previewFailed) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted, textAlign: 'center' }}>{t('reader.previewFailed')}</Text>
        <Pressable accessibilityRole="button" onPress={retryPreview} hitSlop={8}>
          <Text style={{ color: tokens.accentInk, fontWeight: '600' }}>{t('reader.retry')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => back()} hitSlop={8}>
          <Text style={{ color: tokens.muted, fontWeight: '600' }}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  if (doc && !external && isPageRaster && !pdfUri) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{backfilling ? t('reader.preparingPreview') : t('reader.loading')}</Text>
      </View>
    );
  }

  if (doc && !external && !isPageRaster && !nativeUri) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>{t('reader.loading')}</Text>
      </View>
    );
  }

  const pdfOptions = pdfViewOptions(reading);

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      {isPageRaster ? (
        <PdfPageView
          key={`${pdfUri}:${reloadKey}`}
          ref={pdfRef}
          uri={pdfUri!}
          pdfId={pdfId}
          password={password}
          night={night}
          nightAlpha={NIGHT_OVERLAY_ALPHA[reading.nightStrength]}
          enablePaging={pdfOptions.enablePaging}
          fitPolicy={pdfOptions.fitPolicy}
          spacing={pdfOptions.spacing}
          highlightRects={markFlash.rects ?? find.highlightRects}
          initialPage={initialPage}
          onLoad={handleLoad}
          onPageChanged={onPageChanged}
          onTap={onViewerTap}
          onError={handlePdfError}
        />
      ) : format === 'CSV' || format === 'XLSX' || format === 'XLS' ? (
        <SheetView
          key={nativeUri}
          uri={nativeUri!}
          format={format}
          night={night}
          findQuery={find.query}
          onMatchCount={find.setLocalMatchCount}
          onTap={onViewerTap}
        />
      ) : format === 'TXT' ? (
        <TxtView
          key={nativeUri}
          uri={nativeUri!}
          night={night}
          findQuery={find.query}
          onMatchCount={find.setLocalMatchCount}
          onTap={onViewerTap}
        />
      ) : format === 'DOCX' ? (
        <DocxView
          key={nativeUri}
          uri={nativeUri!}
          night={night}
          findQuery={find.query}
          onMatchCount={find.setLocalMatchCount}
          padTop={insets.top + TOP_BAR_ROW_HEIGHT}
          onTap={onViewerTap}
        />
      ) : format === 'DOC' ? (
        // Only on documents added before R5 dropped .doc; there's no viewer for it.
        <View style={styles.unsupported}>
          <Text style={[styles.unsupportedText, { color: tokens.muted }]}>{t('reader.docUnsupported')}</Text>
        </View>
      ) : null}

      {loadProblem === 'damaged' && (
        <View style={styles.passwordOverlay} pointerEvents="box-none">
          <View style={[styles.passwordCard, { backgroundColor: tokens.surface }]}>
            <Text style={[styles.passwordTitle, { color: tokens.ink }]}>{t('reader.cantOpen')}</Text>
            <Text style={{ color: tokens.muted }}>{t('reader.cantOpenBody')}</Text>
            <View style={styles.passwordActions}>
              <Pressable accessibilityRole="button" onPress={() => back()}>
                <Text style={{ color: tokens.accentInk, fontWeight: '600' }}>{t('common.back')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {needsPassword && (
        // §18 W5 (§14 Q4's rule): the card moves up with the keyboard. The app is edge-to-edge,
        // so Android doesn't resize the window for it.
        <KeyboardAvoidingView
          style={[styles.passwordOverlay, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
          behavior="padding"
          pointerEvents="box-none"
        >
          <View style={[styles.passwordCard, { backgroundColor: tokens.surface }]}>
            <Text style={[styles.passwordTitle, { color: tokens.ink }]}>
              {loadProblem === 'password' || loadProblem === 'wrongPassword' ? t('reader.passwordNeeded') : t('reader.passwordTitle')}
            </Text>
            {loadProblem === 'wrongPassword' ? (
              <Text style={{ color: tokens.danger }}>{t('reader.wrongPassword')}</Text>
            ) : null}
            <TextInput
              style={[styles.passwordInput, { color: tokens.ink, borderColor: tokens.edge }]}
              placeholder={t('reader.password')}
              placeholderTextColor={tokens.muted}
              secureTextEntry
              value={passwordDraft}
              onChangeText={setPasswordDraft}
              onSubmitEditing={submitPassword}
            />
            <View style={styles.passwordActions}>
              <Pressable accessibilityRole="button" onPress={() => back()}>
                <Text style={{ color: tokens.muted }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={submitPassword}>
                <Text style={{ color: tokens.accentInk, fontWeight: '600' }}>{t('reader.unlock')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <ReaderTopChrome
        visible={chrome.visible}
        name={title}
        onBack={() => back()}
        onOverflow={() => setOverflowOpen(true)}
        page={shownPage}
        onJump={isPageRaster ? () => setJumpOpen(true) : undefined}
        onFind={format && canFindInDoc(format) ? find.toggle : undefined}
        findOpen={find.open}
        findQuery={find.query}
        onChangeFindQuery={find.changeQuery}
        matchCount={find.matchCount}
        subtitle={submittedSummary(docSubmissions, formatShortDate)}
        onSubtitlePress={() => setSubmissionsOpen(true)}
        bookmarked={canBookmark ? !!currentBookmark : undefined}
        onBookmark={() => {
          if (currentBookmark) dispatch({ type: 'library/REMOVE_BOOKMARK', id: currentBookmark.id });
          else addBookmark();
        }}
        onBookmarkLongPress={() => setLabelling(true)}
      />

      {bookmarkHint.visible ? (
        <Hint
          text={t('shared.hint.readerBookmark')}
          onDismiss={bookmarkHint.dismiss}
          arrow="up"
          arrowAlign="right"
          // Under the top bar's bookmark button (44 pt bar; the overflow button is to its right).
          style={[styles.bookmarkHint, { top: insets.top + 44 + spacing.sm }]}
        />
      ) : null}

      {/* §7 R4: any page two taps away - type its number, or pick its thumbnail. */}
      <TextPromptModal
        visible={jumpOpen}
        title={t('reader.jumpTitle')}
        placeholder={t('reader.jumpPlaceholder', { count: shownPage.count })}
        submitLabel={t('reader.go')}
        keyboardType="number-pad"
        onCancel={() => setJumpOpen(false)}
        onSubmit={(value) => {
          const page = parseJumpInput(value, shownPage.count);
          // The snack would sit under the prompt, so the prompt closes either way.
          setJumpOpen(false);
          if (page === null) dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.noSuchPage', { count: shownPage.count }) });
          else goToPage(shownPage.library && doc ? pdfPageFor(doc, page - 1).page : page);
        }}
      />

      {doc && !external ? (
        <PageScrubberSheet
          visible={scrubberOpen}
          pages={doc.pages}
          currentIdx={currentIdx}
          onPick={(idx) => {
            setScrubberOpen(false);
            goToPage(pdfPageFor(doc, idx).page);
          }}
          onClose={() => setScrubberOpen(false)}
        />
      ) : null}

      <ReaderToolBar visible={chrome.visible} tools={tools} onPress={handleTool} />

      <ReadingSettingsSheet
        visible={readingOpen}
        reading={reading}
        showPageOptions={isPageRaster}
        onChange={setReading}
        onClose={() => setReadingOpen(false)}
      />

      {doc ? (
        <DocTypePickerModal
          visible={typePickerOpen}
          title={t('reader.changeType')}
          value={docTypeOf(doc)}
          onSelect={(docType) => {
            dispatch({ type: 'library/SET_DOC_TYPE', ids: [doc.id], docType });
            dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.typeSet', { type: t(getDocType(docType).labelKey) }) });
          }}
          onClose={() => setTypePickerOpen(false)}
        />
      ) : null}

      <SubmissionsSheet
        visible={submissionsOpen}
        submissions={docSubmissions}
        onShareAgain={(s) => {
          setSubmissionsOpen(false);
          shareSubmission(s);
        }}
        onClose={() => setSubmissionsOpen(false)}
      />

      <OverflowSheet
        visible={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        onSelect={handleOverflowSelect}
        items={moreItems}
        submitHint={submitHint.visible ? { text: t('shared.hint.submit'), onDismiss: submitHint.dismiss } : undefined}
      />

      <BookmarksSheet
        visible={bookmarksOpen}
        items={docBookmarks}
        onOpen={(item) => {
          setBookmarksOpen(false);
          if (doc) goToPage(pdfPageFor(doc, item.idx).page);
        }}
        onRemove={(item) => dispatch({ type: 'library/REMOVE_BOOKMARK', id: item.bookmark.id })}
        onClose={() => setBookmarksOpen(false)}
      />

      <NotesSheet
        visible={notesOpen}
        entries={docNotes}
        onOpen={(entry: NoteEntry) => {
          setNotesOpen(false);
          if (!doc) return;
          const { page } = pdfPageFor(doc, entry.pageIdx);
          goToPage(page);
          const query = flashQuery(entry);
          if (query) markFlash.flash(page, query);
        }}
        onExport={(shown) => {
          if (!doc) return;
          const text = formatNotesExport(shown, notesExportLabels(doc.name));
          shareAs(
            writeExportText(`${doc.id}-notes`, text),
            shareFileName(tDoc('document.notesExport.fileName', { name: doc.name }), 'txt'),
            'text/plain'
          ).catch((e) => console.warn('ReaderScreen: sharing notes failed', e));
        }}
        onClose={() => setNotesOpen(false)}
      />

      <TextPromptModal
        visible={labelling}
        title={currentBookmark ? t('reader.bookmarkLabel') : t('reader.bookmarkPage')}
        initialValue={currentBookmark?.label ?? ''}
        placeholder={t('reader.bookmarkPlaceholder')}
        submitLabel={t('reader.save')}
        onCancel={() => setLabelling(false)}
        onSubmit={(label) => {
          setLabelling(false);
          if (currentBookmark) dispatch({ type: 'library/UPDATE_BOOKMARK', id: currentBookmark.id, label });
          else addBookmark(label);
        }}
      />

      {doc && selectTextIdx !== null ? (
        <SelectTextSheet
          visible
          doc={doc}
          pageIdx={selectTextIdx}
          onClose={(marked) => {
            setSelectTextIdx(null);
            if (marked) syncAnnotations(doc.id);
          }}
        />
      ) : null}

      {signing && doc && doc.pages[signIdx] && (
        <SignatureModal
          visible
          uri={doc.pages[signIdx].fileUri}
          naturalWidth={doc.pages[signIdx].width}
          naturalHeight={doc.pages[signIdx].height}
          onCancel={() => setSigning(false)}
          onConfirm={handleSignConfirm}
        />
      )}

      {editPages.overlays}

      {doc && markIdx !== null ? (
        <MarkView
          doc={doc}
          startIdx={markIdx}
          onClose={({ lastIdx, changed }) => {
            setMarkIdx(null);
            // Back in the native viewer on the page last marked (§5 T1 pageMap: a 2-in-1 sheet
            // holds two library pages).
            goToPage(pdfPageFor(doc, lastIdx).page);
            if (changed) syncAnnotations(doc.id);
          }}
          textTool={{ unlocked: isPro || textUnlocked, pro: !isPro, onUnlock: () => unlockText(doc, () => setTextUnlocked(true)) }}
        />
      ) : null}

      {convert.element}
      {word.element}
      {edit.element}
      {form.element}

      {signStep === 'capture' && (
        <SignatureCaptureModal visible onCancel={() => setSignStep(null)} onCapture={handleSignatureCaptured} />
      )}

      {signStep === 'place' && capturedSignature && signPage && (
        <SignaturePlacementOverlay
          pageUri={signPage.uri}
          pageNaturalWidth={signPage.width}
          pageNaturalHeight={signPage.height}
          signatureUri={capturedSignature.uri}
          signatureAspectRatio={capturedSignature.aspectRatio}
          onCancel={handlePlacementCancel}
          onConfirm={handlePlacementConfirm}
          onRedraw={handleRedraw}
        />
      )}
    </View>
  );
}

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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  passwordOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  passwordCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  passwordTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  passwordInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  passwordActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
  },
});
