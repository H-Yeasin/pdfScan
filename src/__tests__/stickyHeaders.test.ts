import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §14 Q8: no FlashList has both a sticky item (stickyHeaderIndices) and a ListHeaderComponent.
// FlashList 2.0.2 (pinned by Expo SDK 57) works out which item sticks from the scroll offset
// without taking the header's height off it, so at rest the first sticky item's copy is drawn at
// the top, over the header: Files showed its toolbar twice and the course folders cut off. Put
// what would be the header in the data as the list's first item instead (LibraryScreen's FOLDERS).

const SRC = join(__dirname, '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

// Each `<FlashList` element's props: from the tag to the first line that closes it at the tag's
// own indentation (`/>` or `>`), which is how Prettier lays a multi-line element out.
function flashListProps(source: string): string[] {
  const lines = source.split('\n');
  const found: string[] = [];
  lines.forEach((line, i) => {
    if (!line.includes('<FlashList')) return;
    const indent = line.slice(0, line.length - line.trimStart().length);
    const closes = (l: string) => l.startsWith(indent) && /^\/?>/.test(l.slice(indent.length));
    let end = i + 1;
    while (end < lines.length && !closes(lines[end])) end++;
    found.push(lines.slice(i, end + 1).join('\n'));
  });
  return found;
}

const clashes = (props: string) => /\bstickyHeaderIndices\b/.test(props) && /\bListHeaderComponent\b/.test(props);

describe('FlashList sticky items', () => {
  it('never share a list with a ListHeaderComponent', () => {
    const hits: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      if (flashListProps(source).some(clashes)) hits.push(relative(SRC, file));
    }
    expect(hits).toEqual([]);
  });

  it('knows the clash when it sees one', () => {
    const both = ['      <FlashList', '        data={data}', '        stickyHeaderIndices={[0]}', '        ListHeaderComponent={<Header />}', '      />'].join('\n');
    const twoLists = [
      '<FlashList',
      '  stickyHeaderIndices={[1]}',
      '/>',
      '<FlashList',
      '  ListHeaderComponent={<Header />}',
      '/>',
    ].join('\n');
    expect(flashListProps(both).some(clashes)).toBe(true);
    expect(flashListProps(twoLists)).toHaveLength(2);
    expect(flashListProps(twoLists).some(clashes)).toBe(false);
  });
});
