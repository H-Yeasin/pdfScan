import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { syncLibrary } from '../services/persistence/libraryRepo';
import { TABLES, type Row, type Tables } from '../services/backup/format';
import { makeDoc, makePage } from './fixtures';
import type { Annotation, Bookmark, Course, Deadline, LibraryDocument, Semester, Submission, TimetableSlot } from '../types/models';

// §8 B2/B4: a small library on disk with one of everything (two courses, a semester, scans with
// masters/thumbnails/display copies, an Office file, a submission file, a deadline, a timetable
// slot, a note and a bookmark), and helpers to compare a whole library before and after.


function write(rel: string, content: string): string {
  const file = new File(Paths.document, rel);
  file.write(content);
  return file.uri;
}

const semester: Semester = { id: 'sem1', name: 'Spring 2026', startsOn: '2026-01-10', archived: false, createdAt: 1 };
const chem: Course = { id: 'c_chem', name: 'Chemistry', code: 'CHE101', color: 'teal', semesterId: 'sem1', archived: false, sortOrder: 0, createdAt: 1 };
const math: Course = { id: 'c_math', name: 'Math', color: 'blue', archived: false, sortOrder: 1, createdAt: 2 };

function scanDoc(id: string, name: string, courseId: string | undefined, createdAt: number): LibraryDocument {
  return makeDoc({
    id,
    name,
    courseId,
    createdAt,
    pdfUri: write(`library/${id}/document.pdf`, `%PDF ${id}`),
    pages: [
      makePage({
        id: `${id}_p1`,
        fileUri: write(`library/${id}/page_1.jpg`, `master ${id}`),
        thumbUri: write(`library/${id}/thumb_1.jpg`, `thumb ${id}`),
        displayUri: write(`library/${id}/display_1.jpg`, `display ${id}`),
        ocr: { text: `notes ${name}`, blocks: [] },
      }),
    ],
  });
}

export type Seeded = { docs: LibraryDocument[] };

export async function seedLibrary(db: SQLiteDatabase): Promise<Seeded> {
  const lab = scanDoc('d_lab', 'Lab 1', 'c_chem', 10);
  // Same name in the same course: the second becomes "Lab 1 (2).pdf".
  const lab2 = scanDoc('d_lab2', 'Lab 1', 'c_chem', 11);
  const loose = scanDoc('d_loose', 'Receipt: May/June', undefined, 12);
  const mathNotes = scanDoc('d_math', 'Algebra', 'c_math', 13);
  const office = makeDoc({
    id: 'd_docx',
    name: 'Essay',
    format: 'DOCX',
    courseId: 'c_math',
    createdAt: 14,
    pdfUri: undefined,
    contentUri: write('library/d_docx/source.docx', 'PK docx'),
    pages: [],
  });
  write('library/d_lab/submissions/Lab 1 - Rahim.pdf', '%PDF submitted');
  const docs = [lab, lab2, loose, mathNotes, office];

  const slot: TimetableSlot = { id: 'slot1', courseId: 'c_chem', weekday: 1, startMin: 540, endMin: 600 };
  const submission: Submission = {
    id: 'sub1',
    documentId: 'd_lab',
    courseId: 'c_chem',
    fileName: 'Lab 1 - Rahim.pdf',
    sizeBytes: 14,
    sizeLimitBytes: null,
    pageCount: 1,
    createdAt: 20,
  };
  const deadline: Deadline = { id: 'dl1', courseId: 'c_chem', title: 'Lab 2', dueAt: 99, reminderIds: ['os-notif-1'], doneSubmissionId: 'sub1', createdAt: 21 };
  const annotation: Annotation = {
    id: 'an1',
    documentId: 'd_lab',
    pageId: 'd_lab_p1',
    kind: 'note',
    color: 'yellow',
    data: { x: 1, y: 2 },
    text: 'check',
    createdAt: 22,
    updatedAt: 22,
  };
  const bookmark: Bookmark = { id: 'bm1', documentId: 'd_math', pageId: 'd_math_p1', label: 'eq 3', createdAt: 23 };

  await syncLibrary(
    db,
    { documents: [], courses: [], semesters: [], timetable: [] },
    {
      documents: docs,
      courses: [chem, math],
      semesters: [semester],
      timetable: [slot],
      submissions: [submission],
      deadlines: [deadline],
      annotations: [annotation],
      bookmarks: [bookmark],
    }
  );
  return { docs };
}

export async function dumpTables(db: SQLiteDatabase): Promise<Tables> {
  const out = {} as Tables;
  for (const table of TABLES) out[table] = await db.getAllAsync<Row>(`SELECT * FROM ${table} ORDER BY id`);
  return out;
}

export function libraryFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: Directory, prefix: string) => {
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (entry instanceof Directory) walk(entry, `${prefix}${entry.name}/`);
      else out[`${prefix}${entry.name}`] = entry.textSync();
    }
  };
  walk(new Directory(Paths.document, 'library'), '');
  return out;
}
