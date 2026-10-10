import type { Annotation, Bookmark, Course, Deadline, DocType, LibraryDocument, LibraryPage, ReaderPosition, Semester, Submission, TimetableSlot } from '../../types/models';
import { nextCourseColor } from '../../services/courses/palette';
import { samePosition } from '../../services/documents/positionCodec';

// 'failed' means the stored library couldn't be read. Nothing is written back to disk until a
// load succeeds, so a read error can never overwrite the real library with an empty one.
export type LibraryLoadStatus = 'loading' | 'ready' | 'failed';

// What the library holds; all of it is saved (useLibraryPersistence), apart from the load status.
// What the screens show of it (search, selection, the open tab and course, indexing progress)
// lives in libraryUiSlice.ts (§16 G5).
export type LibraryState = {
  loadStatus: LibraryLoadStatus;
  // Bumped by RETRY_LOAD; useLibraryPersistence reloads whenever it changes.
  loadAttempt: number;
  files: LibraryDocument[];
  // Always sorted by sortOrder (the reducer keeps it that way). Includes archived courses; screens
  // filter them out where they shouldn't appear.
  courses: Course[];
  // Newest start date first, as loaded.
  semesters: Semester[];
  // The optional weekly timetable (§3 K5), by weekday then start time.
  timetable: TimetableSlot[];
  // §4 S7: every file handed in, newest first. Rows go with their document.
  submissions: Submission[];
  // §4 S8: course deadlines, by due date. Done ones stay (they record the submission).
  deadlines: Deadline[];
  // §5 T4: highlights, ink and notes on library pages, oldest first.
  annotations: Annotation[];
  // §5 T5: bookmarked pages, oldest first.
  bookmarks: Bookmark[];
};

export const initialLibraryState: LibraryState = {
  loadStatus: 'loading',
  loadAttempt: 0,
  files: [],
  courses: [],
  semesters: [],
  timetable: [],
  submissions: [],
  deadlines: [],
  annotations: [],
  bookmarks: [],
};

export type LibraryAction =
  | { type: 'library/SET_LOAD_STATUS'; status: LibraryLoadStatus }
  | { type: 'library/RETRY_LOAD' }
  | { type: 'library/SET_FILES'; files: LibraryDocument[] }
  | { type: 'library/ADD_FILE'; file: LibraryDocument }
  | { type: 'library/REMOVE_FILES'; ids: string[] }
  | { type: 'library/TOGGLE_STAR'; id: string }
  | { type: 'library/UPDATE_FILE'; id: string; patch: Partial<LibraryDocument> }
  // §16 G4: a document's word boxes, read from the database after the load (documents/pageOcr.ts).
  | { type: 'library/SET_PAGE_OCR'; id: string; pages: readonly LibraryPage[] }
  // §16 G6: a thumbnail built for a page that had none (services/library/thumbnails.ts).
  | { type: 'library/SET_PAGE_THUMB'; id: string; pageId: string; thumbUri: string }
  | { type: 'library/REPLACE_FILES'; ids: string[]; files: LibraryDocument[] }
  | { type: 'library/SET_COURSES'; courses: Course[] }
  // `color` defaults to the next unused palette colour; the course goes to the end of the list.
  | { type: 'library/CREATE_COURSE'; id: string; name: string; fields?: Partial<Omit<CourseFields, 'name'>> }
  | { type: 'library/UPDATE_COURSE'; id: string; patch: Partial<CourseFields> }
  | { type: 'library/REORDER_COURSES'; ids: string[] }
  | { type: 'library/DELETE_COURSE'; id: string }
  | { type: 'library/SET_SEMESTERS'; semesters: Semester[] }
  | { type: 'library/CREATE_SEMESTER'; semester: Omit<Semester, 'archived' | 'createdAt'> }
  | { type: 'library/UPDATE_SEMESTER'; id: string; patch: Partial<Omit<Semester, 'id' | 'createdAt'>> }
  | { type: 'library/ARCHIVE_SEMESTER'; id: string }
  | { type: 'library/DELETE_SEMESTER'; id: string }
  | { type: 'library/SET_TIMETABLE'; timetable: TimetableSlot[] }
  | { type: 'library/SET_SUBMISSIONS'; submissions: Submission[] }
  | { type: 'library/ADD_SUBMISSION'; submission: Submission }
  | { type: 'library/SET_ARCHIVED'; ids: string[]; archived: boolean }
  | { type: 'library/SET_DEADLINES'; deadlines: Deadline[] }
  | { type: 'library/ADD_DEADLINE'; deadline: Deadline }
  | { type: 'library/UPDATE_DEADLINE'; id: string; patch: Partial<Omit<Deadline, 'id'>> }
  | { type: 'library/DELETE_DEADLINE'; id: string }
  | { type: 'library/SET_ANNOTATIONS'; annotations: Annotation[] }
  | { type: 'library/ADD_ANNOTATION'; annotation: Annotation }
  | { type: 'library/DELETE_ANNOTATIONS'; ids: string[] }
  | { type: 'library/UPDATE_ANNOTATION'; id: string; patch: Partial<Omit<Annotation, 'id'>> }
  | { type: 'library/SET_BOOKMARKS'; bookmarks: Bookmark[] }
  | { type: 'library/ADD_BOOKMARK'; bookmark: Bookmark }
  | { type: 'library/UPDATE_BOOKMARK'; id: string; label: string | undefined }
  | { type: 'library/REMOVE_BOOKMARK'; id: string }
  | { type: 'library/ADD_SLOT'; slot: TimetableSlot }
  | { type: 'library/UPDATE_SLOT'; id: string; patch: Partial<Omit<TimetableSlot, 'id'>> }
  | { type: 'library/REMOVE_SLOT'; id: string }
  | { type: 'library/ASSIGN_COURSE'; ids: string[]; courseId: string | null }
  | { type: 'library/SET_DOC_TYPE'; ids: string[]; docType: DocType }
  | { type: 'library/SET_LAST_PAGE'; id: string; page: number }
  | { type: 'library/SET_LAST_POSITION'; id: string; position: ReaderPosition };

// The editable part of a course: everything but its identity, position (REORDER_COURSES) and
// creation time.
export type CourseFields = Omit<Course, 'id' | 'sortOrder' | 'createdAt'>;

function byDueAt(deadlines: Deadline[]): Deadline[] {
  return [...deadlines].sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
}

function sortSlots(slots: TimetableSlot[]): TimetableSlot[] {
  return [...slots].sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin || a.id.localeCompare(b.id));
}

function bySortOrder(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

// Listed ids take positions 0..n-1 in that order; any course not listed keeps its relative order
// after them. Courses whose position didn't change keep their object, so only moved ones are saved.
function reorder(courses: Course[], ids: string[]): Course[] {
  const listed = ids.map((id) => courses.find((c) => c.id === id)).filter((c): c is Course => !!c);
  const rest = courses.filter((c) => !ids.includes(c.id));
  return [...listed, ...rest].map((c, i) => (c.sortOrder === i ? c : { ...c, sortOrder: i }));
}

function followPages<T extends { documentId: string; pageId: string }>(
  items: T[],
  replacedIds: string[],
  files: LibraryDocument[]
): T[] {
  const docByPage = new Map<string, string>();
  for (const file of files) for (const page of file.pages) docByPage.set(page.id, file.id);
  return items.flatMap((item) => {
    if (!replacedIds.includes(item.documentId) || files.some((f) => f.id === item.documentId)) return [item];
    const documentId = docByPage.get(item.pageId);
    return documentId ? [{ ...item, documentId }] : [];
  });
}

export function libraryReducer(state: LibraryState, action: LibraryAction): LibraryState {
  switch (action.type) {
    // §7 R4: where the Reader is in a document. The pages array is kept as it is, so saving it
    // writes only the document row (libraryRepo.syncLibrary).
    case 'library/SET_LAST_PAGE':
      return {
        ...state,
        files: state.files.map((f) => (f.id === action.id && f.lastPage !== action.page ? { ...f, lastPage: action.page } : f)),
      };
    // §18 W19: the same for every format, and exact (ReaderPosition). A position equal to the saved
    // one keeps the state, so a Reader coming to rest where it was writes nothing.
    case 'library/SET_LAST_POSITION': {
      const at = state.files.find((f) => f.id === action.id);
      if (!at || samePosition(at.lastPosition, action.position)) return state;
      return { ...state, files: state.files.map((f) => (f === at ? { ...f, lastPosition: action.position } : f)) };
    }
    case 'library/SET_LOAD_STATUS':
      return { ...state, loadStatus: action.status };
    case 'library/RETRY_LOAD':
      return { ...state, loadStatus: 'loading', loadAttempt: state.loadAttempt + 1 };
    case 'library/SET_FILES':
      return { ...state, files: action.files };
    case 'library/ADD_FILE':
      return { ...state, files: [action.file, ...state.files] };
    case 'library/REMOVE_FILES':
      return {
        ...state,
        files: state.files.filter((f) => !action.ids.includes(f.id)),
        // Their submissions go too (ON DELETE CASCADE on disk; the files are in the document folder).
        submissions: state.submissions.filter((s) => !action.ids.includes(s.documentId)),
        annotations: state.annotations.filter((a) => !action.ids.includes(a.documentId)),
        bookmarks: state.bookmarks.filter((b) => !action.ids.includes(b.documentId)),
      };
    case 'library/TOGGLE_STAR':
      return {
        ...state,
        files: state.files.map((f) => (f.id === action.id ? { ...f, star: !f.star } : f)),
      };
    case 'library/UPDATE_FILE':
      return {
        ...state,
        // A page that left the document takes its annotations with it.
        annotations: action.patch.pages
          ? state.annotations.filter(
              (a) => a.documentId !== action.id || action.patch.pages!.some((p) => p.id === a.pageId)
            )
          : state.annotations,
        bookmarks: action.patch.pages
          ? state.bookmarks.filter((b) => b.documentId !== action.id || action.patch.pages!.some((p) => p.id === b.pageId))
          : state.bookmarks,
        files: state.files.map((f) => {
          if (f.id !== action.id) return f;
          return { ...f, ...action.patch };
        }),
      };
    case 'library/SET_PAGE_OCR': {
      // By page id, and only for a page still waiting for its boxes: the document may have changed
      // while they were read (a page removed, or recognised again), and what it has now wins.
      const loaded = new Map(action.pages.map((p) => [p.id, p.ocr]));
      return {
        ...state,
        files: state.files.map((f) => {
          if (f.id !== action.id || !f.pages.some((p) => p.ocr?.blocksRow !== undefined && loaded.has(p.id))) return f;
          return { ...f, pages: f.pages.map((p) => (p.ocr?.blocksRow !== undefined && loaded.has(p.id) ? { ...p, ocr: loaded.get(p.id) } : p)) };
        }),
      };
    }
    case 'library/SET_PAGE_THUMB': {
      // By page id, and only for a page still without one: the document may have changed while it
      // was built (the page removed, or its thumbnail written by the indexer).
      const doc = state.files.find((f) => f.id === action.id);
      if (!doc || !doc.pages.some((p) => p.id === action.pageId && !p.thumbUri)) return state;
      return {
        ...state,
        files: state.files.map((f) =>
          f === doc ? { ...f, pages: f.pages.map((p) => (p.id === action.pageId ? { ...p, thumbUri: action.thumbUri } : p)) } : f
        ),
      };
    }
    case 'library/REPLACE_FILES':
      return {
        ...state,
        files: [...action.files, ...state.files.filter((f) => !action.ids.includes(f.id))],
        // A document replaced by others (merge, split) takes its submissions with it.
        submissions: state.submissions.filter(
          (s) => !action.ids.includes(s.documentId) || action.files.some((f) => f.id === s.documentId)
        ),
        // §7 R2: merge and split keep page ids, so a replaced document's bookmarks and annotations
        // move to the new document that has their page; the rest go with it.
        annotations: followPages(state.annotations, action.ids, action.files),
        bookmarks: followPages(state.bookmarks, action.ids, action.files),
      };
    case 'library/SET_COURSES':
      return { ...state, courses: bySortOrder(action.courses) };
    case 'library/CREATE_COURSE': {
      const fields = action.fields ?? {};
      const course: Course = {
        ...fields,
        id: action.id,
        name: action.name,
        color: fields.color ?? nextCourseColor(state.courses),
        archived: fields.archived ?? false,
        sortOrder: state.courses.reduce((max, c) => Math.max(max, c.sortOrder + 1), 0),
        createdAt: Date.now(),
      };
      return { ...state, courses: [...state.courses, course] };
    }
    case 'library/UPDATE_COURSE':
      return {
        ...state,
        courses: state.courses.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      };
    case 'library/REORDER_COURSES':
      return { ...state, courses: reorder(state.courses, action.ids) };
    case 'library/DELETE_COURSE':
      // Documents in the course move to Unsorted; their files stay where they are.
      return {
        ...state,
        courses: state.courses.filter((c) => c.id !== action.id),
        // Its class times go with it (ON DELETE CASCADE on disk).
        timetable: state.timetable.filter((s) => s.courseId !== action.id),
        files: state.files.map((f) => (f.courseId === action.id ? { ...f, courseId: undefined } : f)),
        submissions: state.submissions.map((s) => (s.courseId === action.id ? { ...s, courseId: undefined } : s)),
        // Its deadlines go with it (ON DELETE CASCADE); useDeadlineReminders cancels their reminders.
        deadlines: state.deadlines.filter((d) => d.courseId !== action.id),
      };
    case 'library/ASSIGN_COURSE':
      return {
        ...state,
        files: state.files.map((f) =>
          action.ids.includes(f.id) ? { ...f, courseId: action.courseId ?? undefined } : f
        ),
      };
    case 'library/SET_SEMESTERS':
      return { ...state, semesters: action.semesters };
    case 'library/CREATE_SEMESTER':
      return {
        ...state,
        semesters: [{ ...action.semester, archived: false, createdAt: Date.now() }, ...state.semesters],
      };
    case 'library/UPDATE_SEMESTER':
      return {
        ...state,
        semesters: state.semesters.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };
    case 'library/ARCHIVE_SEMESTER':
      // The semester and its courses together; synced to disk in one transaction (syncLibrary).
      // Their documents are untouched. Un-archiving is per course/semester (UPDATE_*), since a
      // student may want only some courses back.
      return {
        ...state,
        semesters: state.semesters.map((s) => (s.id === action.id ? { ...s, archived: true } : s)),
        courses: state.courses.map((c) => (c.semesterId === action.id && !c.archived ? { ...c, archived: true } : c)),
      };
    case 'library/DELETE_SEMESTER':
      // Its courses stay, with no semester (mirrors ON DELETE SET NULL).
      return {
        ...state,
        semesters: state.semesters.filter((s) => s.id !== action.id),
        courses: state.courses.map((c) => (c.semesterId === action.id ? { ...c, semesterId: undefined } : c)),
      };
    case 'library/SET_TIMETABLE':
      return { ...state, timetable: sortSlots(action.timetable) };
    case 'library/SET_SUBMISSIONS':
      return { ...state, submissions: action.submissions };
    case 'library/ADD_SUBMISSION':
      return { ...state, submissions: [action.submission, ...state.submissions] };
    case 'library/SET_ARCHIVED':
      return {
        ...state,
        files: state.files.map((f) => (action.ids.includes(f.id) ? { ...f, archived: action.archived || undefined } : f)),
      };
    case 'library/SET_DEADLINES':
      return { ...state, deadlines: byDueAt(action.deadlines) };
    case 'library/ADD_DEADLINE':
      return { ...state, deadlines: byDueAt([...state.deadlines, action.deadline]) };
    case 'library/UPDATE_DEADLINE':
      return { ...state, deadlines: byDueAt(state.deadlines.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d))) };
    case 'library/DELETE_DEADLINE':
      return { ...state, deadlines: state.deadlines.filter((d) => d.id !== action.id) };
    case 'library/SET_ANNOTATIONS':
      return { ...state, annotations: action.annotations };
    case 'library/ADD_ANNOTATION':
      return { ...state, annotations: [...state.annotations, action.annotation] };
    case 'library/SET_BOOKMARKS':
      return { ...state, bookmarks: action.bookmarks };
    case 'library/ADD_BOOKMARK':
      // One bookmark per page.
      return state.bookmarks.some((b) => b.documentId === action.bookmark.documentId && b.pageId === action.bookmark.pageId)
        ? state
        : { ...state, bookmarks: [...state.bookmarks, action.bookmark] };
    case 'library/UPDATE_BOOKMARK':
      return { ...state, bookmarks: state.bookmarks.map((b) => (b.id === action.id ? { ...b, label: action.label?.trim() || undefined } : b)) };
    case 'library/REMOVE_BOOKMARK':
      return { ...state, bookmarks: state.bookmarks.filter((b) => b.id !== action.id) };
    case 'library/UPDATE_ANNOTATION':
      return { ...state, annotations: state.annotations.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)) };
    case 'library/DELETE_ANNOTATIONS':
      return { ...state, annotations: state.annotations.filter((a) => !action.ids.includes(a.id)) };
    case 'library/ADD_SLOT':
      return { ...state, timetable: sortSlots([...state.timetable, action.slot]) };
    case 'library/UPDATE_SLOT':
      return {
        ...state,
        timetable: sortSlots(state.timetable.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s))),
      };
    case 'library/REMOVE_SLOT':
      return { ...state, timetable: state.timetable.filter((s) => s.id !== action.id) };
    case 'library/SET_DOC_TYPE':
      return {
        ...state,
        files: state.files.map((f) => (action.ids.includes(f.id) && f.docType !== action.docType ? { ...f, docType: action.docType } : f)),
      };
    default:
      return state;
  }
}
