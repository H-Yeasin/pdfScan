import { makeDoc } from '../../../test/fixtures';
import { resetStorage } from '../../../test/db';
import { getDb } from '../../persistence/dbService';
import { nextTypeNumber as nextTypeNumberInDb, syncLibrary } from '../../persistence/libraryRepo';
import { CAPTURE_MODES, getCaptureModeSpec } from '../../capture/captureModes';
import { DOC_TYPES, defaultDocTypeFor, docTypeCounts, docTypeOf, nextTypeNumber } from '../docTypes';

describe('doc type registry', () => {
  it('has the six types in display order', () => {
    expect(DOC_TYPES.map((t) => t.id)).toEqual(['assignment', 'notes', 'handout', 'exam', 'lab', 'other']);
  });

  it.each([
    ['notes', 'notes'],
    ['doc', 'handout'],
    ['board', 'notes'],
    ['book', 'handout'],
    ['id', 'other'],
  ] as const)('%s mode defaults to %s', (mode, type) => {
    expect(defaultDocTypeFor(getCaptureModeSpec(mode))).toBe(type);
  });

  it('gives every capture mode a default', () => {
    for (const spec of CAPTURE_MODES) expect(DOC_TYPES.map((t) => t.id)).toContain(defaultDocTypeFor(spec));
  });

  it('treats an untyped document as Other and counts per type', () => {
    expect(docTypeOf({})).toBe('other');
    expect(docTypeCounts([{ docType: 'lab' }, {}, { docType: 'assignment' }, { docType: 'lab' }])).toEqual([
      { type: 'assignment', count: 1 },
      { type: 'lab', count: 2 },
      { type: 'other', count: 1 },
    ]);
  });
});

describe('nextTypeNumber', () => {
  const docs = [
    makeDoc({ id: 'hw1', courseId: 'math', docType: 'assignment' }),
    makeDoc({ id: 'hw2', courseId: 'math', docType: 'assignment' }),
    makeDoc({ id: 'lab1', courseId: 'math', docType: 'lab' }),
    makeDoc({ id: 'bio-hw1', courseId: 'bio', docType: 'assignment' }),
    makeDoc({ id: 'loose', docType: 'assignment' }),
    makeDoc({ id: 'untyped', courseId: 'math' }),
  ];

  it('counts per course and type', () => {
    expect(nextTypeNumber(docs, 'math', 'assignment')).toBe(3);
    expect(nextTypeNumber(docs, 'bio', 'assignment')).toBe(2);
    expect(nextTypeNumber(docs, 'math', 'exam')).toBe(1);
    expect(nextTypeNumber(docs, undefined, 'assignment')).toBe(2);
    expect(nextTypeNumber(docs, 'math', 'other')).toBe(2);
  });

  describe('in the database', () => {
    beforeEach(resetStorage);

    it('matches the in-memory rule, and deleted documents free their number', async () => {
      const db = await getDb();
      const empty = { documents: [], courses: [], semesters: [], timetable: [] };
      const courses = ['math', 'bio'].map((id, i) => ({ id, name: id, color: 'teal' as const, archived: false, sortOrder: i, createdAt: 0 }));
      const stored = { ...empty, courses, documents: docs };
      await syncLibrary(db, empty, stored);
      expect(await nextTypeNumberInDb(db, 'math', 'assignment')).toBe(3);
      expect(await nextTypeNumberInDb(db, undefined, 'assignment')).toBe(2);
      expect(await nextTypeNumberInDb(db, 'math', 'other')).toBe(2);

      await syncLibrary(db, stored, { ...stored, documents: docs.filter((d) => d.id !== 'hw2') });
      expect(await nextTypeNumberInDb(db, 'math', 'assignment')).toBe(2);
    });
  });
});
