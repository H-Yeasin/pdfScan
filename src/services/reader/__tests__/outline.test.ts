import type { PdfOutlineItem } from '../../pdf/pdfNative';
import { currentSection, flattenOutline, OUTLINE_MAX_DEPTH, OUTLINE_MAX_ENTRIES, sectionIndex, type OutlineEntry } from '../outline';

const item = (title: string, page?: number, children: PdfOutlineItem[] = []): PdfOutlineItem => ({ title, page, children });

describe('flattenOutline', () => {
  it('lists the tree in reading order with each depth', () => {
    const tree = [item('One', 0, [item('1.1', 1), item('1.2', 3, [item('1.2.1', 4)])]), item('Two', 6)];
    expect(flattenOutline(tree, 10).map((e) => [e.title, e.page, e.depth])).toEqual([
      ['One', 0, 0],
      ['1.1', 1, 1],
      ['1.2', 3, 1],
      ['1.2.1', 4, 2],
      ['Two', 6, 0],
    ]);
  });

  it('gives every entry its own key', () => {
    const entries = flattenOutline([item('A', 0, [item('A', 0)]), item('A', 0)], 3);
    expect(new Set(entries.map((e) => e.key)).size).toBe(3);
  });

  it('tidies titles and drops the ones with none, keeping their children a level up', () => {
    const tree = [item('  Chapter\n  one \t', 0), item('   ', 2, [item('Inside', 3)])];
    expect(flattenOutline(tree, 10).map((e) => [e.title, e.depth])).toEqual([
      ['Chapter one', 0],
      ['Inside', 0],
    ]);
  });

  it('keeps an entry whose page is not in the file, without the page', () => {
    const entries = flattenOutline([item('Gone', 40), item('Nowhere'), item('Bad', -1), item('Half', 1.5), item('Last', 9)], 10);
    expect(entries.map((e) => e.page)).toEqual([undefined, undefined, undefined, undefined, 9]);
  });

  it('stops at the entry cap', () => {
    const many = Array.from({ length: OUTLINE_MAX_ENTRIES + 500 }, (_, i) => item(`E${i}`, 0, [item(`E${i}.1`, 0)]));
    const entries = flattenOutline(many, 1);
    expect(entries).toHaveLength(OUTLINE_MAX_ENTRIES);
    expect(entries[entries.length - 1].title).toBe(`E${OUTLINE_MAX_ENTRIES / 2 - 1}.1`);
  });

  it('stops at the depth cap', () => {
    let tree = item('L20', 0);
    for (let level = 19; level >= 0; level -= 1) tree = item(`L${level}`, 0, [tree]);
    const entries = flattenOutline([tree], 1);
    expect(entries).toHaveLength(OUTLINE_MAX_DEPTH);
    expect(Math.max(...entries.map((e) => e.depth))).toBe(OUTLINE_MAX_DEPTH - 1);
  });

  it('is empty for no outline', () => {
    expect(flattenOutline([], 10)).toEqual([]);
  });
});

describe('currentSection', () => {
  const entry = (title: string, page: number | undefined, depth = 0): OutlineEntry => ({ key: title, title, page, depth });
  const entries = [entry('Preface', 2), entry('Part I', undefined), entry('One', 5), entry('1.1', 5, 1), entry('1.2', 8, 1), entry('Two', 12)];

  it('is the section that starts on or nearest before the page', () => {
    expect(currentSection(entries, 2)?.title).toBe('Preface');
    expect(currentSection(entries, 4)?.title).toBe('Preface');
    expect(currentSection(entries, 9)?.title).toBe('1.2');
    expect(currentSection(entries, 500)?.title).toBe('Two');
  });

  it('is the most specific of several that start on the same page', () => {
    expect(currentSection(entries, 5)?.title).toBe('1.1');
    expect(currentSection(entries, 7)?.title).toBe('1.1');
    expect(sectionIndex(entries, 5)).toBe(3);
  });

  it('is nothing before the first section, and never a heading without a page', () => {
    expect(currentSection(entries, 0)).toBeNull();
    expect(sectionIndex(entries, 1)).toBe(-1);
    expect(currentSection([entry('Part I', undefined)], 3)).toBeNull();
  });

  it('does not need the entries in page order', () => {
    const mixed = [entry('Appendix', 30), entry('Intro', 1), entry('Body', 10)];
    expect(currentSection(mixed, 12)?.title).toBe('Body');
    expect(currentSection(mixed, 31)?.title).toBe('Appendix');
  });
});
