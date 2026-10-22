import { useMemo } from 'react';
import { DocTypePickerModal } from '../courses/DocTypeChips';
import { FolderPickerModal } from '../deliver/FolderPickerModal';
import type { DocumentActions } from '../library/useDocumentActions';
import { TextPromptModal } from '../shared/TextPromptModal';
import { useHint } from '../shared/useHint';
import { SubmissionsSheet } from '../submit/SubmissionsSheet';
import { tDoc } from '../../i18n';
import { useT } from '../../i18n/useT';
import { documentNotes, formatNotesExport, notesExportLabels, type NoteEntry } from '../../services/annotations/notesPanel';
import { docTypeOf, getDocType } from '../../services/courses/docTypes';
import { parseJumpInput, type PageLabel } from '../../services/documents/readerPosition';
import { readerMoreItemIds, type ReaderMoreItemId, type ReaderMoreSection } from '../../services/documents/readerTools';
import type { ReadingSettings } from '../../services/documents/readingSettings';
import type { OutlineEntry } from '../../services/reader/outline';
import { shareAs, shareFileName } from '../../services/sharing/shareService';
import { writeExportText } from '../../services/study/textExport';
import { useShareSubmission } from '../../store/useSubmitDocument';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import type { Bookmark, LibraryDocument, Submission } from '../../types/models';
import { createId } from '../../utils/id';
import { NotesSheet } from './NotesSheet';
import { OverflowSheet } from './OverflowSheet';
import { PageScrubberSheet } from './PageScrubberSheet';
import { PageTextSheet } from './PageTextSheet';
import { ReadingSettingsSheet } from './ReadingSettingsSheet';
import type { ReaderSheets as Sheets } from './useReaderSheets';

type Props = {
  sheets: Sheets;
  // The library document on screen; undefined for a file from outside.
  doc: LibraryDocument | undefined;
  isPageRaster: boolean;
  // The library page on screen, and the page numbers the top bar shows (§18 W5).
  currentIdx: number;
  shownPage: PageLabel;
  goToPage: (page: number) => void;
  // §18 W10: to a library page (0-based), exactly: the page surface shows a 2-in-1 sheet's two
  // pages one by one, which a PDF page can't name.
  goToIdx: (idx: number) => void;
  // §18 W11: the PDF's contents, read by the page surface ([] elsewhere), and a library page's
  // text for the "Read page text" sheet.
  outline: OutlineEntry[];
  pageText: (idx: number) => Promise<string>;
  // A mark picked in the Notes panel lights up on its page, once the Reader has gone there.
  flashNote: (entry: NoteEntry) => void;
  moreSections: ReaderMoreSection[];
  onSelectMore: (id: ReaderMoreItemId) => void;
  // §18 W23: what Rename and Move do once answered.
  documentActions: DocumentActions;
  submissions: Submission[];
  currentBookmark: Bookmark | undefined;
  addBookmark: (label?: string) => void;
};

// §18 W6: every sheet the Reader opens (services/reader/readerSheets), and what each one's
// answer does. Which one is open is `sheets.sheet`; the signature's are useReaderSigning's.
export function ReaderSheets({
  sheets,
  doc,
  isPageRaster,
  currentIdx,
  shownPage,
  goToPage,
  goToIdx,
  outline,
  pageText,
  flashNote,
  moreSections,
  onSelectMore,
  documentActions,
  submissions,
  currentBookmark,
  addBookmark,
}: Props) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  const reading = state.settings.reading;
  const shareSubmission = useShareSubmission();
  const { close } = sheets;
  const open = sheets.sheet?.kind;
  const textIdx = sheets.sheet?.kind === 'pageText' ? sheets.sheet.idx : null;

  // §12 D4: the notes panel: marks, notes and bookmarks by page (§18 W23: the bookmarks' only list
  // in the Reader; the top bar adds and labels them).
  const docNotes = useMemo(
    () => (doc ? documentNotes(doc, state.library.annotations, state.library.bookmarks) : []),
    [doc, state.library.annotations, state.library.bookmarks]
  );
  // §9 O3: the Submit hint shows inside the More sheet, next to Submit, the first time it's there.
  const hasSubmit = useMemo(() => readerMoreItemIds(moreSections).includes('submit'), [moreSections]);
  const submitHint = useHint('submit', open === 'more' && hasSubmit);

  return (
    <>
      {/* §7 R4: any page two taps away - type its number, or pick its thumbnail. */}
      <TextPromptModal
        visible={open === 'jump'}
        title={t('reader.jumpTitle')}
        placeholder={t('reader.jumpPlaceholder', { count: shownPage.count })}
        submitLabel={t('reader.go')}
        keyboardType="number-pad"
        onCancel={() => close('jump')}
        onSubmit={(value) => {
          const page = parseJumpInput(value, shownPage.count);
          // The snack would sit under the prompt, so the prompt closes either way.
          close('jump');
          if (page === null) dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.noSuchPage', { count: shownPage.count }) });
          else if (shownPage.library && doc) goToIdx(page - 1);
          else goToPage(page);
        }}
      />

      {doc ? (
        <PageScrubberSheet
          visible={open === 'pages'}
          documentId={doc.id}
          pages={doc.pages}
          currentIdx={currentIdx}
          onPick={(idx) => {
            close('pages');
            goToIdx(idx);
          }}
          outline={outline}
          // The surface's pages are the file's own wherever there is an outline.
          onPickOutline={(page) => {
            close('pages');
            goToIdx(page);
          }}
          onClose={() => close('pages')}
        />
      ) : null}

      <PageTextSheet
        visible={textIdx !== null}
        title={textIdx !== null ? t('a11y.pageOf', { n: textIdx + 1, total: shownPage.count }) : ''}
        load={() => (textIdx !== null ? pageText(textIdx) : Promise.resolve(''))}
        onClose={() => close('pageText')}
      />

      <ReadingSettingsSheet
        visible={open === 'reading'}
        reading={reading}
        showPageOptions={isPageRaster}
        onChange={(patch: Partial<ReadingSettings>) => dispatch({ type: 'settings/SET_READING', reading: patch })}
        onClose={() => close('reading')}
      />

      {doc ? (
        <DocTypePickerModal
          visible={open === 'type'}
          title={t('reader.changeType')}
          value={docTypeOf(doc)}
          onSelect={(docType) => {
            dispatch({ type: 'library/SET_DOC_TYPE', ids: [doc.id], docType });
            dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.typeSet', { type: t(getDocType(docType).labelKey) }) });
          }}
          onClose={() => close('type')}
        />
      ) : null}

      {doc ? (
        <TextPromptModal
          visible={open === 'rename'}
          title={t('reader.renameTitle')}
          initialValue={doc.name}
          submitLabel={t('reader.save')}
          onCancel={() => close('rename')}
          onSubmit={(name) => {
            close('rename');
            documentActions.rename(doc, name);
          }}
        />
      ) : null}

      {doc ? (
        <FolderPickerModal
          visible={open === 'move'}
          courses={state.library.courses}
          selectedCourseId={doc.courseId ?? null}
          onSelect={(courseId) => documentActions.move([doc], courseId)}
          onCreate={(name) => {
            const id = createId('course');
            dispatch({ type: 'library/CREATE_COURSE', id, name });
            return id;
          }}
          onClose={() => close('move')}
        />
      ) : null}

      <SubmissionsSheet
        visible={open === 'submissions'}
        submissions={submissions}
        onShareAgain={(s) => {
          close('submissions');
          shareSubmission(s);
        }}
        onClose={() => close('submissions')}
      />

      <OverflowSheet
        visible={open === 'more'}
        onClose={() => close('more')}
        onSelect={onSelectMore}
        sections={moreSections}
        starred={!!doc?.star}
        submitHint={submitHint.visible ? { text: t('shared.hint.submit'), onDismiss: submitHint.dismiss } : undefined}
      />

      <NotesSheet
        visible={open === 'notes'}
        entries={docNotes}
        onOpen={(entry: NoteEntry) => {
          close('notes');
          if (!doc) return;
          goToIdx(entry.pageIdx);
          flashNote(entry);
        }}
        onExport={(shown) => {
          if (!doc) return;
          const text = formatNotesExport(shown, notesExportLabels(doc.name));
          shareAs(
            writeExportText(`${doc.id}-notes`, text),
            shareFileName(tDoc('document.notesExport.fileName', { name: doc.name }), 'txt'),
            'text/plain'
          ).catch((e) => console.warn('ReaderSheets: sharing notes failed', e));
        }}
        onClose={() => close('notes')}
      />

      <TextPromptModal
        visible={open === 'label'}
        title={currentBookmark ? t('reader.bookmarkLabel') : t('reader.bookmarkPage')}
        initialValue={currentBookmark?.label ?? ''}
        placeholder={t('reader.bookmarkPlaceholder')}
        submitLabel={t('reader.save')}
        onCancel={() => close('label')}
        onSubmit={(label) => {
          close('label');
          if (currentBookmark) dispatch({ type: 'library/UPDATE_BOOKMARK', id: currentBookmark.id, label });
          else addBookmark(label);
        }}
      />
    </>
  );
}
