import { makeDoc } from '../../../test/fixtures';
import type { Course } from '../../../types/models';
import { defaultDirFor, modifiedAt, sortDocuments, type DocumentSort } from '../documentSort';
import { DEFAULT_FILES_VIEW, normalizeFilesView } from '../filesView';

// §17 U7: Files' orders.
const course = (id: string, sortOrder: number): Course => ({ id, name: id, color: 'teal', archived: false, sortOrder, createdAt: 0 });
const courses = [course('phys', 0), course('math', 1)];
const docs = [
  makeDoc({ id: 'a', name: 'Lab 10', createdAt: 100, updatedAt: 500, sizeBytes: 30, courseId: 'math' }),
  makeDoc({ id: 'b', name: 'lab 2', createdAt: 300, sizeBytes: 10 }),
  makeDoc({ id: 'c', name: 'Essay', createdAt: 200, updatedAt: 250, sizeBytes: 20, courseId: 'phys' }),
];
const order = (sort: DocumentSort) => sortDocuments(docs, sort, courses).map((d) => d.id);

describe('documentSort', () => {
  it('sorts by date modified, falling back to created', () => {
    expect(modifiedAt(docs[1])).toBe(300);
    expect(order({ key: 'modified', dir: 'desc' })).toEqual(['a', 'b', 'c']);
    expect(order({ key: 'modified', dir: 'asc' })).toEqual(['c', 'b', 'a']);
  });

  it('sorts by date created', () => {
    expect(order({ key: 'created', dir: 'desc' })).toEqual(['b', 'c', 'a']);
  });

  it('sorts names as a person reads them: case aside, numbers counted', () => {
    expect(order({ key: 'name', dir: 'asc' })).toEqual(['c', 'b', 'a']);
    expect(order({ key: 'name', dir: 'desc' })).toEqual(['a', 'b', 'c']);
  });

  it('sorts by size', () => {
    expect(order({ key: 'size', dir: 'desc' })).toEqual(['a', 'c', 'b']);
  });

  it('sorts by course in the courses’ own order, Unsorted last both ways', () => {
    expect(order({ key: 'course', dir: 'asc' })).toEqual(['c', 'a', 'b']);
    expect(order({ key: 'course', dir: 'desc' })).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties newest first, and never changes its input', () => {
    const same = [makeDoc({ id: 'x', name: 'Same', createdAt: 1 }), makeDoc({ id: 'y', name: 'Same', createdAt: 2 })];
    expect(sortDocuments(same, { key: 'name', dir: 'asc' }).map((d) => d.id)).toEqual(['y', 'x']);
    expect(same.map((d) => d.id)).toEqual(['x', 'y']);
  });

  it('starts each order in its natural direction', () => {
    expect(defaultDirFor('name')).toBe('asc');
    expect(defaultDirFor('course')).toBe('asc');
    expect(defaultDirFor('modified')).toBe('desc');
    expect(defaultDirFor('size')).toBe('desc');
  });
});

describe('filesView.normalizeFilesView', () => {
  it('reads what was saved, and falls back for anything else', () => {
    expect(normalizeFilesView({ sort: { key: 'name', dir: 'asc' }, layout: 'grid' })).toEqual({ sort: { key: 'name', dir: 'asc' }, layout: 'grid' });
    expect(normalizeFilesView(undefined)).toBe(DEFAULT_FILES_VIEW);
    expect(normalizeFilesView({ sort: { key: 'colour', dir: 'up' }, layout: 'tiles' })).toEqual(DEFAULT_FILES_VIEW);
  });
});
