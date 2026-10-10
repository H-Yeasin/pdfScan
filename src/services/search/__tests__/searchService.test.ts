import { makeDoc, makePage } from '../../../test/fixtures';
import { getMatchSnippet, searchDocuments } from '../searchService';

const notes = makeDoc({ id: 'a', name: 'Week 3', pages: [makePage({ ocr: { text: 'Krebs cycle in the Mitochondria', blocks: [] } })] });
const lab = makeDoc({ id: 'b', name: 'Lab report', pages: [makePage()] });

describe('searchDocuments', () => {
  it('matches the name or any page text, ignoring case', () => {
    expect(searchDocuments([notes, lab], 'mitochondria')).toEqual([notes]);
    expect(searchDocuments([notes, lab], ' LAB ')).toEqual([lab]);
    expect(searchDocuments([notes, lab], '')).toEqual([notes, lab]);
    expect(searchDocuments([notes, lab], 'photosynthesis')).toEqual([]);
  });

  // §16 G4: the search text is built on the first search, and once per document object.
  it("reads a document's pages once, however many searches follow", () => {
    let reads = 0;
    const page = makePage();
    Object.defineProperty(page, 'ocr', {
      enumerable: true,
      get() {
        reads += 1;
        return { text: 'entropy', blocks: [] };
      },
    });
    const doc = makeDoc({ id: 'c', pages: [page] });
    expect(reads).toBe(0);
    expect(searchDocuments([doc], 'entropy')).toEqual([doc]);
    expect(searchDocuments([doc], 'entr')).toEqual([doc]);
    expect(searchDocuments([doc], 'nothing')).toEqual([]);
    expect(reads).toBe(1);
  });

  it('follows a rename: the reducer makes a new document object', () => {
    expect(searchDocuments([lab], 'thesis')).toEqual([]);
    const renamed = { ...lab, name: 'Thesis draft' };
    expect(searchDocuments([renamed], 'thesis')).toEqual([renamed]);
  });
});

describe('getMatchSnippet', () => {
  it('shows text around a match that the name does not already show', () => {
    expect(getMatchSnippet(notes, 'cycle')).toBe('Krebs cycle in the Mitochondria');
    expect(getMatchSnippet(notes, 'week')).toBeUndefined();
    expect(getMatchSnippet(lab, 'cycle')).toBeUndefined();
  });

  // §16 G6: the list asks for every row's snippet on each of its renders.
  it('searches a document once per query, and again when the query or the document changes', () => {
    let reads = 0;
    const page = makePage();
    Object.defineProperty(page, 'ocr', { get: () => (reads++, { text: 'Entropy always grows', blocks: [] }) });
    const doc = makeDoc({ name: 'Physics', pages: [page] });

    expect(getMatchSnippet(doc, 'grows')).toBe('Entropy always grows');
    expect(getMatchSnippet(doc, 'grows')).toBe('Entropy always grows');
    expect(getMatchSnippet(doc, ' Grows ')).toBe('Entropy always grows');
    expect(reads).toBe(1);

    expect(getMatchSnippet(doc, 'entropy')).toBe('Entropy always grows');
    expect(reads).toBe(2);
    // No match is remembered too.
    expect(getMatchSnippet(doc, 'nothing')).toBeUndefined();
    expect(getMatchSnippet(doc, 'nothing')).toBeUndefined();
    expect(reads).toBe(3);

    const renamed = { ...doc, name: 'Entropy notes' };
    expect(getMatchSnippet(renamed, 'entropy')).toBeUndefined();
  });
});
